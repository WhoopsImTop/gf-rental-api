const db = require("../models");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { logger } = require("../services/logging");
const {
  generateEmailHtml,
  sendErrorEmail,
  sendNotificationEmail,
} = require("../services/mailService");
const { getGeoData } = require("../services/geoCoder");
const { generateContractPdf } = require("../services/export/contractExport");
const {
  orderAdminNotification,
  contractSignedAdminNotification,
} = require("../services/notification/order");
const { getUserScore } = require("../services/auth/personalScore");

const SIGN_LINK_VALIDITY_HOURS = 72;
const SHARE_LINK_VALIDITY_HOURS = 168;
const SIGNATURE_MAX_BYTES = 1024 * 1024 * 2;

const hashSignToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const normalizeSignToken = (token) => {
  if (!token || typeof token !== "string") return "";
  let decoded = "";
  try {
    decoded = decodeURIComponent(token).trim();
  } catch (error) {
    return "";
  }
  const hexMatch = decoded.match(/[A-Fa-f0-9]{64}/);
  if (hexMatch) {
    return hexMatch[0].toLowerCase();
  }
  return decoded.replace(/\s/g, "");
};

const getPublicAppBaseUrl = () => {
  const appUrl = process.env.APPURL || "http://localhost:3002/auto-abo";
  return appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
};

const getPublicApiBaseUrl = () => {
  const apiUrl = process.env.API_URL || "http://localhost:3000/api";
  return apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
};

const ensurePendingLinkState = (contract) => {
  const now = new Date();
  if (contract.signedAt || contract.signStatus === "signed") return "signed";
  if (contract.signTokenUsedAt) return "used";
  if (!contract.signTokenHash) return "missing";
  if (!contract.signExpiresAt || contract.signExpiresAt < now) return "expired";
  return "valid";
};

const resolveSignContractByToken = async (token) => {
  const normalizedToken = normalizeSignToken(token);
  if (!normalizedToken) {
    return { reason: "invalid" };
  }
  const tokenHash = hashSignToken(normalizedToken);
  const contract = await db.Contract.findOne({
    where: { signTokenHash: tokenHash },
    include: [
      {
        model: db.User,
        include: {
          model: db.CustomerDetails,
          as: "customerDetails",
        },
      },
      {
        model: db.CarAbo,
        as: "carAbo",
      },
      {
        model: db.CarAboColor,
        as: "color",
        required: false,
      },
      {
        model: db.CarAboPrice,
        as: "price",
        required: false,
      },
    ],
  });

  if (!contract) return { reason: "not_found" };

  const state = ensurePendingLinkState(contract);
  if (state === "expired" && contract.signStatus !== "expired") {
    await contract.update({ signStatus: "expired" });
  }
  if (state !== "valid") return { reason: state, contract };
  return { reason: "valid", contract, tokenHash, normalizedToken };
};

const sendContractFileByName = (res, fileName) => {
  const safeName = path.basename(fileName || "");
  const filePath = path.join(__dirname, "../internal-files/contracts", safeName);
  if (!fileName || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Datei auf dem Server nicht gefunden." });
  }
  if (safeName.toLowerCase().endsWith(".pdf")) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    res.setHeader("Cache-Control", "no-store");
  }
  return res.sendFile(filePath);
};

const sendSignatureFileByName = (res, fileName) => {
  const safeName = path.basename(fileName || "");
  const filePath = path.join(__dirname, "../internal-files/signatures", safeName);
  if (!fileName || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Signaturdatei auf dem Server nicht gefunden." });
  }
  return res.sendFile(filePath);
};

const deleteContractFileIfExists = (fileName) => {
  if (!fileName) return;
  const safeName = path.basename(fileName);
  const filePath = path.join(__dirname, "../internal-files/contracts", safeName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const resolveActiveContractFileName = (contract) =>
  contract?.signedContractFile ||
  contract?.uploadedContractFile ||
  contract?.contractFile ||
  null;

const canManageContract = (contract, user) =>
  contract.userId === user.id || user.role === "ADMIN" || user.role === "SELLER";

function formatContractStartingDate(dateValue) {
  if (!dateValue) return "-";

  const value = String(dateValue).trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let date;

  if (match) {
    const [, year, month, day] = match;
    date = new Date(Number(year), Number(month) - 1, Number(day));
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "2-digit",
  });
}

function addDays(date, daysToAdd) {
  const result = new Date(date);
  result.setDate(result.getDate() + daysToAdd);
  return result;
}

exports.getAllContracts = async (req, res) => {
  try {
    const contracts = await db.Contract.findAll({
      include: [
        {
          model: db.User,
          include: {
            model: db.CustomerDetails,
            as: "customerDetails",
          },
        },
        {
          model: db.CarAbo,
          as: "carAbo",
        },
        {
          model: db.CarAboColor,
          as: "color",
          required: false,
        },
        {
          model: db.CarAboPrice,
          as: "price",
          required: false,
        },
      ],
    });

    const mappedContracts = contracts.map((contract) => {
      const asJson = contract.toJSON();
      return {
        ...asJson,
        activeContractFile: resolveActiveContractFileName(asJson),
      };
    });

    res.status(201).json({
      message: "Contracts fetched Successfully",
      contracts: mappedContracts,
    });
  } catch (e) {
    console.error("Error creating contract:", e);
    res.status(500).json({
      message: "Internal server error",
      error: e.message,
    });
  }
};

exports.createContract = async (req, res) => {
  let {
    carAboId,
    colorId,
    userId,
    customerDetails, // birthday, street, housenumber, postalCode, city, country, driversLicenseNumber, IdCardNumber, newsletter, consents, allowedLicenseClasses, licenseValidUntil, licenseIssuingPlace, licenseIssuedOn, placeOfBirth
    contractData, // duration, startingDate, monthlyPrice, totalCost, insurancePackage, insuranceCosts, familyAndFriends, delivery options
    paymentData, // iban, accountHolderName, sepaMandate, score
    cartId,
  } = req.body;

  try {
    if (!customerDetails || typeof customerDetails !== "object") {
      throw new Error("MISSING_CUSTOMER_DETAILS");
    }
    if (!contractData || typeof contractData !== "object") {
      throw new Error("MISSING_CONTRACT_DATA");
    }
    if (!paymentData || typeof paymentData !== "object") {
      throw new Error("MISSING_PAYMENT_DATA");
    }

    const result = await db.sequelize.transaction(async (transaction) => {
      if (!userId) {
        logger(
          "error",
          "Creating Contract lasted in Error because of missing userID",
        );
        if (!userId) {
          // Wirf einen Fehler, der die Transaktion abbricht!
          throw new Error("MISSING_USER_ID");
        }
      }

      // 1. Create or Update CustomerDetails
      let details = await db.CustomerDetails.findOne({
        where: { userId },
        transaction,
      });

      //Make licenseIssuedOn and licenseValidUntil ISO date
      const licenseIssuedOn = customerDetails.licenseIssuedOn ? new Date(customerDetails.licenseIssuedOn) : null;
      const licenseValidUntil = customerDetails.licenseValidUntil ? new Date(customerDetails.licenseValidUntil) : null;

      const detailsPayload = {
        userId,
        birthday: customerDetails.birthday,
        street: customerDetails.street || "",
        housenumber: customerDetails.housenumber,
        postalCode: customerDetails.postalCode,
        city: customerDetails.city,
        country: customerDetails.country || "Deutschland",
        newsletter: customerDetails.newsletter || false,
        allowsCreditworthyCheck:
          customerDetails.allowsCreditworthyCheck || true,
        allowedToPurchase: customerDetails.allowedToPurchase || true,
        acceptPrivacyPolicy: customerDetails.acceptPrivacyPolicy || true,
        driversLicenseNumber: customerDetails.driversLicenseNumber,
        IdCardNumber: customerDetails.IdCardNumber,
        allowedLicenseClasses: customerDetails.allowedLicenseClasses,
        licenseValidUntil: licenseValidUntil,
        licenseIssuingPlace: customerDetails.licenseIssuingPlace,
        licenseIssuedOn: licenseIssuedOn,
        placeOfBirth: customerDetails.placeOfBirth,
      };

      if (details) {
        await details.update(detailsPayload, { transaction });
      } else {
        await db.CustomerDetails.create(detailsPayload, { transaction });
      }

      // Also update User basic info if provided
      if (
        customerDetails.firstName ||
        customerDetails.lastName ||
        customerDetails.phone
      ) {
        const userUpdatePayload = {};
        if (customerDetails.firstName)
          userUpdatePayload.firstName = customerDetails.firstName;
        if (customerDetails.lastName)
          userUpdatePayload.lastName = customerDetails.lastName;
        if (customerDetails.phone)
          userUpdatePayload.phone = customerDetails.phone;

        await db.User.update(userUpdatePayload, {
          where: { id: userId },
          transaction,
        });
      }

      const Cart = await db.Cart.findOne({
        where: { id: cartId },
        include: [
          {
            model: db.CarAbo,
            as: "car",
            include: [
              { model: db.CarAboPrice, as: "prices" },
              {
                model: db.CarAboColor,
                as: "colors",
                include: [{ model: db.Media, as: "media" }],
              },
              {
                model: db.CarAboMedia,
                as: "media",
                include: [{ model: db.Media, as: "media" }],
              },
              {
                model: db.Seller,
                as: "seller",
              },
            ],
          },
        ],
      });

      if (!Cart) {
        throw new Error("CART_NOT_FOUND");
      }

      let userScore = { score: "Kein Score vorhanden" };
      if (!Cart.syncedByCantamen) {
        // check if personal score of user is matching the score in the settings
        const settings = await db.Setting.findOne();
        if (!settings || settings.allowedScore == null) {
          throw new Error("SETTINGS_ALLOWED_SCORE_MISSING");
        }
        userScore = await getUserScore(
          customerDetails.firstName,
          customerDetails.lastName,
          customerDetails.birthday,
          customerDetails.street + " " + customerDetails.housenumber,
          customerDetails.postalCode,
          customerDetails.city,
          cartId,
        );
        //the score is between P and A and our settingkey is allowedScore
        if (userScore.score > settings.allowedScore) {
          throw new Error("SCORE_REJECTED");
        }
      }

      //check if color is already ordered if so return a message and a redirectUrl /leider-abonniert
      const color = await db.CarAboColor.findOne({
        where: {
          id: colorId,
          isOrdered: true,
        },
      });

      if (color) {
        throw new Error("COLOR_ALREADY_ORDERED");
      }

      //get Lat Lng
      let lat = null;
      let lon = null;
      if (detailsPayload.street && detailsPayload.city) {
        const address = `${detailsPayload.street} ${detailsPayload.housenumber}, ${detailsPayload.postalCode} ${detailsPayload.city}`;
        const geoData = await getGeoData(address);
        lat = geoData?.lat;
        lon = geoData?.lon;
      }

      // 2. Create Contract

      //2.1 Create duration, monthlyPrice and totalcosts
      const syncedByCantamen = Cart.syncedByCantamen || false;

      let selectedPrice = null;

      if (Cart.priceId && Cart.car && Cart.car.prices) {
        selectedPrice = Cart.car.prices.find(
          (price) => price.id === Cart.priceId,
        );
      }

      if (!selectedPrice) {
        throw new Error("PRICE_CONFIGURATION_INVALID");
      }

      const duration = selectedPrice.durationMonths;
      const validDurationType =
        Cart.durationType === "minimum" ? "minimum" : "fixed";
      const basePrice =
        validDurationType === "minimum"
          ? parseFloat(selectedPrice.priceMinimumDuration)
          : parseFloat(selectedPrice.priceFixedDuration);
      if (!Number.isFinite(basePrice) || !Number.isFinite(Number(duration)) || Number(duration) <= 0) {
        throw new Error("PRICE_CONFIGURATION_INVALID");
      }
      const depVal = parseFloat(Cart.depositValue) || 0;
      let monthlyPrice = basePrice;
      if (depVal > 0) {
        monthlyPrice = basePrice - (depVal * 1.025) / parseInt(duration);
      }
      //check if insurance is included and add it to the monthly price
      if (contractData.insurancePackage) {
        monthlyPrice += parseFloat(contractData.insuranceCosts);
      }
      monthlyPrice = Math.round(monthlyPrice);
      const totalCost = duration * monthlyPrice;

      const contract = await db.Contract.create(
        {
          userId,
          duration: contractData.duration,
          totalCost: contractData.totalCost,
          startingDate: contractData.startingDate,
          insurancePackage: contractData.insurancePackage || false,
          insuranceType: contractData.insuranceType || "none",
          insuranceCosts: contractData.insuranceCosts || 0,
          insuranceDeductibleHaftpflicht:
            contractData.insuranceDeductibleHaftpflicht || null,
          insuranceDeductibleTeilkasko:
            contractData.insuranceDeductibleTeilkasko || null,
          familyAndFriends: contractData.familyAndFriends || false,
          familyAndFriendsCosts: contractData.familyAndFriendsCosts || 0,
          familyAndFriendsMembers: contractData.familyAndFriendsMembers || [],
          // Delivery
          wantsDelivery: contractData.wantsDelivery || false,
          deliveryCosts: contractData.deliveryCosts || 0,
          differentDeliveryAdress:
            contractData.differentDeliveryAdress || false,
          deliveryStreet: contractData.deliveryStreet || null,
          deliveryHousenumber: contractData.deliveryHousenumber || null,
          deliveryPostalCode: contractData.deliveryPostalCode || null,
          deliveryCountry: contractData.deliveryCountry || null,
          deliveryNote: contractData.deliveryNote || null,
          // Payment
          accountHolderName: paymentData.accountHolderName || null,
          iban: paymentData.iban || null,
          sepaMandate: paymentData.sepaMandate || false,
          mandateReference: paymentData.mandateReference || null,
          sepaMandateDate: paymentData.sepaMandate ? new Date() : null,
          score: paymentData.score || null,
          // Status
          oderStatus: "started",
          duration: duration,
          monthlyPrice: monthlyPrice.toFixed(2) || monthlyPrice,
          totalCost: totalCost,
          orderCompleted: true,
          carAboId: Cart.carAboId,
          colorId: Cart.colorId,
          priceId: Cart.priceId,
          durationType: Cart.durationType || "fixed",
          depositValue: Cart.depositValue,
          calculatedMonthlyPrice: Cart.calculatedMonthlyPrice,
          syncedByCantamen: syncedByCantamen,
          score: userScore.score || "Kein Score vorhanden",
          lat: lat,
          lng: lon,
        },
        { transaction },
      );

      // 3. Link CarAbo to Contract
      await contract.setCarAbo(carAboId, { transaction });
      await db.CarAbo.update(
        { ContractId: contract.id, status: "reserved" },
        { where: { id: carAboId }, transaction },
      );

      // 4. Update Color Variant Stock
      if (colorId) {
        const colorToUpdate = await db.CarAboColor.findOne({
          where: { id: colorId },
          transaction,
        });

        const colorUpdatePayload = { isOrdered: true };
        const hasDynamicAvailability =
          colorToUpdate &&
          (colorToUpdate.availableFrom == null ||
            colorToUpdate.availableFrom === "") &&
          Number.isInteger(colorToUpdate.availableInDays) &&
          colorToUpdate.availableInDays >= 0;

        // Freeze "Verfügbar ab" at order time for dynamic day-based colors.
        if (hasDynamicAvailability) {
          colorUpdatePayload.availableFrom = addDays(
            new Date(),
            colorToUpdate.availableInDays,
          );
        }

        await db.CarAboColor.update(
          colorUpdatePayload,
          { where: { id: colorId }, transaction },
        );
      }

      // 5. Mark Cart as Completed
      if (cartId) {
        await db.Cart.update(
          { completed: true },
          { where: { id: cartId }, transaction },
        );
      }

      // 6. send Email to Customer
      const user = await db.User.findOne({
        include: [{ model: db.CustomerDetails, as: "customerDetails" }],
        where: { id: userId },
        transaction, // <--- DAS HAT GEFEHLT
      });

      const autoAbo = await db.CarAbo.findOne({
        include: [
          {
            model: db.CarAboColor,
            as: "colors",
            include: [{ model: db.Media, as: "media" }],
            where: { id: contract.colorId },
          },
          {
            model: db.CarAboMedia,
            as: "media",
            include: [{ model: db.Media, as: "media" }],
          },
        ],
        where: { id: contract.carAboId },
        transaction, // <--- AUCH HIER
      });

      // Sicherheits-Check: Falls User trotzdem nicht gefunden wurde
      if (!user) {
        throw new Error("User for email notification not found");
      }
      if (!user.customerDetails) {
        throw new Error("USER_DETAILS_MISSING_FOR_EMAIL");
      }
      const previewImageUrl = autoAbo?.colors?.[0]?.media?.url || "";

      const emailContent = `
${previewImageUrl ? `<img src="${previewImageUrl}" width="100%" height="auto"/>` : ""}
<p>Guten Tag ${user.firstName} ${user.lastName + "," ?? ""}</p>
      <p>Hiermit bestätigen wir Ihr Abo Abo. Den Mietvertrag werden wir Ihnen in Kürze per Email senden.</p>
      <hr style="margin: 10px; border: 1px solid #efefef;"/>
      <h2 style="font-weight: 900; margin: 0; padding: 0;">Ihre Daten</h2>
      <table style="width: 100%; border: 1px solid #efefef;">
        <tbody>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Vorname</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${user.firstName}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Nachname</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${user.lastName}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Straße</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${user.customerDetails.street} ${
            user.customerDetails.housenumber
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">PLZ</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${user.customerDetails.postalCode}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Ort</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${user.customerDetails.city}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Telefon</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${user.phone}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Email</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${user.email}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Wunschstarttermin</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${formatContractStartingDate(contract.startingDate)}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Sicherheitspaket</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            contract.insuranceType === "premium"
              ? "Premium"
              : contract.insuranceType === "basic"
                ? "Basic"
                : contract.insurancePackage
                  ? "Ja"
                  : "Nein"
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Vertragslaufzeit</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${contract.duration} ${
            contract.duration > 1 ? "Monate" : "Monat"
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Kilometerleistung</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            selectedPrice.mileageKm
          }km</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Führerscheinnummer</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            user.customerDetails.driversLicenseNumber
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Personalausweisnummer</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            user.customerDetails.IdCardNumber
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Monatliche Gesamtrate:</td><td style="padding: 8px 16px; margin: 0;border-bottom: 1px solid #efefef">${parseFloat(contract.monthlyPrice).toFixed(2)} €</td></tr>
        ${
          contract.depositValue > 0
            ? `<tr><td style="padding: 8px 16px; margin: 0;">Anzahlung (Einmalig)</td><td style="padding: 8px 16px; margin: 0;">${parseFloat(contract.depositValue).toFixed(2)} €</td></tr>`
            : ""
        }
        </tbody>
      </table>

      ${contract.durationType === "minimum" ? `<p>Ohne fristgerechte Kündigung (1 Monat vor Vertragsende) verlängert sich die Nutzung.</p>` : ""}
      ${contract.durationType === "minimum" && contract.depositValue > 0 ? `<p>Der Monatsbeitrag des Fahrzeuges steigt dann auf <strong>${parseFloat(selectedPrice.priceMinimumDuration).toFixed(2)} €</strong> (ohne Anzahlungsvorteil).</p>` : ""}

      <hr style="margin: 10px; border: 1px solid #efefef;"/>
      <h2 style="font-weight: 900; margin: 0; padding: 0;">Nächste Schritte</h2>
        <ol style="padding-left: 15px">
          <li><strong>Vertrag und Übergabe</strong><br>
          Wir überprüfen Ihre Angaben und senden Ihnen Ihren Vertrag und das Bestätigte Übergabedatum zu.</li>
          <li><strong>Vertragsunterschrift</strong><br>Bitte senden Sie uns den Vertrag unterschrieben zurück.</li>
          ${contract.depositValue > 0 ? "<li><strong>Abbuchung der Anzahlung</strong><br>Wir werden Ihre Anzahlung ein paar Tage vor Übergabe des Fahrzeuges abbuchen.</li>" : ""}
          <li><strong>Übergabe Ihres Fahrzeuges</strong><br>
          Bei der Übergabe muss Führerschein und Personalausweis in Original vorgelegt werden.</li>
        </ol>
      <hr style="margin: 10px; border: 1px solid #efefef;"/>
      <p>Die erste Rate wird in den nächsten Tagen von deinem Konto abgebucht.</p>
      <p>Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung.</p>
      <p style="margin-bottom:0">Wir wünschen Ihnen viel Spaß mit Ihrem neuen Auto Abo.<br>
      <strong>Ihr Grüne Flotte Team</strong></p>`;

      const generatedEmailContent = await generateEmailHtml(
        "Ihre Auto Abo Bestellung",
        emailContent,
      );

      const emailSent = await sendNotificationEmail(
        user.email,
        null,
        "Ihre Auto Abo Bestellung - Grüne Flotte Auto Abo",
        generatedEmailContent,
      );

      if (!emailSent) {
        // Hier "contract.id" statt "Contract.id" (Variablen sind Case-Sensitive!)
        logger(
          "error",
          "Email konnte nicht versendet werden für Contract: #" + contract.id,
        );
      }

      orderAdminNotification(contract.id);

      return contract;
    });

    res.status(201).json({
      message: "Contract created successfully",
      contractId: result.id,
    });
    // ÄUSSERER Catch-Block:
  } catch (error) {
    console.error("Error creating contract:", error);

    // Eigene Fehler abfangen und richtig beantworten
    if (error.message === "MISSING_USER_ID") {
      return res
        .status(400)
        .json({ message: "No UserId Provided. Please try again" });
    }
    if (error.message === "SCORE_REJECTED") {
      return res.status(200).json({
        message: "User score is not matching the score in the settings",
        redirectUrl: "/nicht-abonnierbar",
      });
    }
    if (error.message === "COLOR_ALREADY_ORDERED") {
      return res.status(200).json({
        message: "Color is already ordered",
        redirectUrl: "/leider-abonniert",
      });
    }
    if (error.message === "CART_NOT_FOUND") {
      return res.status(400).json({
        message: "Warenkorb nicht gefunden. Bitte starte die Buchung erneut.",
      });
    }
    if (
      error.message === "MISSING_CUSTOMER_DETAILS" ||
      error.message === "MISSING_CONTRACT_DATA" ||
      error.message === "MISSING_PAYMENT_DATA"
    ) {
      return res.status(400).json({
        message: "Unvollstaendige Bestelldaten. Bitte pruefe die Eingaben.",
      });
    }
    if (error.message === "SETTINGS_ALLOWED_SCORE_MISSING") {
      return res.status(500).json({
        message:
          "Bonitaetspruefung ist nicht konfiguriert. Bitte Support kontaktieren.",
      });
    }
    if (error.message === "USER_DETAILS_MISSING_FOR_EMAIL") {
      return res.status(500).json({
        message:
          "Kundendaten fuer die Bestellbestaetigung fehlen. Bitte Support kontaktieren.",
      });
    }
    if (error.message === "PRICE_CONFIGURATION_INVALID") {
      return res.status(400).json({
        message:
          "Die gewählte Preiskonfiguration ist nicht mehr gültig. Bitte Fahrzeug erneut konfigurieren.",
      });
    }

    // Genereller Server-Fehler
    logger("error", "Error creating contract" + error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.archiveContract = async (req, res) => {
  const id = req.params.id;
  try {
    let contract = await db.Contract.findOne({ where: { id } });
    if (!contract) {
      return res
        .status(404)
        .json({ success: false, message: "Contract not found" });
    }
    if (
      contract.userId !== req.user.id &&
      req.user.role !== "ADMIN" &&
      req.user.role !== "SELLER"
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    let isArchivedContract = contract.archived;
    let updatedArchivedValue = !isArchivedContract;
    let updatedContract = await db.Contract.update(
      { archived: updatedArchivedValue },
      { where: { id } },
    );
    res.status(201).json({
      success: true,
      message: "Contract updated successfully",
      updatedContract: id,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.generateContract = async (req, res) => {
  const contractId = req.params.id;

  const contract = await db.Contract.findByPk(contractId, {
    include: [
      {
        model: db.User,
        include: {
          model: db.CustomerDetails,
          as: "customerDetails",
        },
      },
      {
        model: db.CarAbo,
        as: "carAbo",
      },
      {
        model: db.CarAboColor,
        as: "color",
        required: false,
      },
      {
        model: db.CarAboPrice,
        as: "price",
        required: false,
      },
    ],
  });

  if (!contract) {
    return res.status(404).send("Vertrag nicht gefunden");
  }

  try {
    const pdfFileName = await generateContractPdf(contract);

    // Speichere den Dateinamen zurück in die DB
    await contract.update({ contractFile: pdfFileName });

    res.json({
      success: true,
      file: pdfFileName,
      activeContractFile: resolveActiveContractFileName({
        uploadedContractFile: contract.uploadedContractFile,
        signedContractFile: contract.signedContractFile,
        contractFile: pdfFileName,
      }),
    });
  } catch (err) {
    res.status(500).json({
      error: "PDF konnte nicht erstellt werden",
      errorMessage: err,
    });
  }
};

exports.uploadContractFile = async (req, res) => {
  const id = req.params.id;
  try {
    const contract = await db.Contract.findByPk(id);
    if (!contract) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }
    if (!canManageContract(contract, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (!req.file?.filename) {
      return res.status(400).json({
        success: false,
        message: "Bitte eine gueltige PDF-Datei hochladen.",
      });
    }

    const newFileName = req.file.filename;
    const oldGeneratedFile = contract.contractFile;
    const oldUploadedFile = contract.uploadedContractFile;
    const oldSignedFile = contract.signedContractFile;

    await contract.update({
      contractFile: newFileName,
      uploadedContractFile: newFileName,
      signedContractFile: null,
      signStatus: "not_requested",
      signTokenHash: null,
      signRequestedAt: null,
      signExpiresAt: null,
      signTokenUsedAt: null,
      signedAt: null,
      signatureImagePath: null,
      signatureIp: null,
      signatureUserAgent: null,
      signatureFullName: null,
    });

    if (oldGeneratedFile && oldGeneratedFile !== newFileName) {
      deleteContractFileIfExists(oldGeneratedFile);
    }
    if (
      oldUploadedFile &&
      oldUploadedFile !== newFileName &&
      oldUploadedFile !== oldGeneratedFile
    ) {
      deleteContractFileIfExists(oldUploadedFile);
    }
    if (
      oldSignedFile &&
      oldSignedFile !== newFileName &&
      oldSignedFile !== oldGeneratedFile &&
      oldSignedFile !== oldUploadedFile
    ) {
      deleteContractFileIfExists(oldSignedFile);
    }

    return res.status(201).json({
      success: true,
      message: "Vertragsdatei hochgeladen.",
      contract: {
        ...contract.toJSON(),
        uploadedContractFile: req.file.filename,
        activeContractFile: resolveActiveContractFileName({
          ...contract.toJSON(),
          uploadedContractFile: req.file.filename,
        }),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Interner Serverfehler",
      error: error.message,
    });
  }
};

exports.viewContractFile = async (req, res) => {
  try {
    const { filename } = req.params;
    const userId = req.user.id; // Aus dem JWT Token
    const userRole = req.user.role;
    // 1. DB-Check: Gehört die Datei dem User? (Schutz gegen IDOR)
    const contract = await db.Contract.findOne({
      where: {
        [db.Sequelize.Op.or]: [
          { contractFile: filename },
          { signedContractFile: filename },
          { uploadedContractFile: filename },
        ],
      },
    });

    if (!contract) {
      return res.status(404).json({ error: "Vertrag nicht gefunden." });
    }

    // Sicherheits-Check: Nur der Eigentümer oder ein Admin/Seller darf die Datei sehen
    if (
      contract.userId !== userId &&
      userRole !== "ADMIN" &&
      userRole !== "SELLER"
    ) {
      return res.status(403).json({ error: "Zugriff verweigert." });
    }

    // 2. Pfad zur Datei (außerhalb des public-Ordners)
    // 2. Datei sicher senden
    return sendContractFileByName(res, filename);
  } catch (error) {
    console.error("Download Error:", error);
    res.status(500).json({ error: "Interner Serverfehler." });
  }
};

exports.viewSignatureFile = async (req, res) => {
  try {
    const { filename } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const contract = await db.Contract.findOne({
      where: { signatureImagePath: filename },
    });

    if (!contract) {
      return res.status(404).json({ error: "Signatur nicht gefunden." });
    }

    if (
      contract.userId !== userId &&
      userRole !== "ADMIN" &&
      userRole !== "SELLER"
    ) {
      return res.status(403).json({ error: "Zugriff verweigert." });
    }

    return sendSignatureFileByName(res, filename);
  } catch (error) {
    console.error("Signature view error:", error);
    return res.status(500).json({ error: "Interner Serverfehler." });
  }
};

exports.shareContractFile = async (req, res) => {
  try {
    const { accessKey } = req.params;
    const tokenHash = hashSignToken(accessKey);
    const contract = await db.Contract.findOne({ where: { shareTokenHash: tokenHash } });

    if (!contract) {
      return res.status(401).json({ error: "Ungültiger Zugriffsschlüssel." });
    }
    if (!contract.shareExpiresAt || new Date(contract.shareExpiresAt) < new Date()) {
      return res.status(410).json({ error: "Zugriffsschluessel abgelaufen." });
    }

    const activeFile = resolveActiveContractFileName(contract);
    return sendContractFileByName(res, activeFile);
  } catch (error) {
    console.error("Download Error:", error);
    res.status(500).json({ error: "Interner Serverfehler." });
  }
};

exports.issueContractShareLink = async (req, res) => {
  const id = req.params.id;
  try {
    const contract = await db.Contract.findByPk(id, {
      include: [{ model: db.User }],
    });
    if (!contract) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }
    if (!canManageContract(contract, req.user)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const activeFile = resolveActiveContractFileName(contract);
    if (!activeFile) {
      return res.status(400).json({
        success: false,
        message: "Kein Vertrag vorhanden. Bitte zuerst PDF erzeugen oder Datei hochladen.",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const shareTokenHash = hashSignToken(rawToken);
    const now = new Date();
    const shareExpiresAt = new Date(
      now.getTime() + SHARE_LINK_VALIDITY_HOURS * 60 * 60 * 1000,
    );
    await contract.update({ shareTokenHash, shareRequestedAt: now, shareExpiresAt });
    const shareUrl = `${getPublicApiBaseUrl()}/contracts/share/${rawToken}`;

    return res.status(201).json({
      success: true,
      message: "Freigabelink wurde erstellt.",
      shareUrl,
      shareExpiresAt,
      activeContractFile: activeFile,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Interner Serverfehler",
      error: error.message,
    });
  }
};

exports.issueContractSignLink = async (req, res) => {
  const id = req.params.id;
  try {
    const contract = await db.Contract.findByPk(id, {
      include: [
        {
          model: db.User,
          include: { model: db.CustomerDetails, as: "customerDetails" },
        },
        { model: db.CarAbo, as: "carAbo" },
        { model: db.CarAboColor, as: "color", required: false },
        { model: db.CarAboPrice, as: "price", required: false },
      ],
    });

    if (!contract) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }
    if (
      contract.userId !== req.user.id &&
      req.user.role !== "ADMIN" &&
      req.user.role !== "SELLER"
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    let contractFile = resolveActiveContractFileName(contract);
    if (!contractFile) {
      contractFile = await generateContractPdf(contract);
      await contract.update({ contractFile });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const signTokenHash = hashSignToken(rawToken);
    const now = new Date();
    const signExpiresAt = new Date(
      now.getTime() + SIGN_LINK_VALIDITY_HOURS * 60 * 60 * 1000,
    );
    const signingUrl = `${getPublicAppBaseUrl()}/sign/${rawToken}`;

    await contract.update({
      signStatus: "pending_signature",
      signTokenHash,
      signRequestedAt: now,
      signExpiresAt,
      signTokenUsedAt: null,
      signedAt: null,
      signatureImagePath: null,
      signedContractFile: null,
      signatureIp: null,
      signatureUserAgent: null,
      signatureFullName: null,
    });

    const customerFirstName = contract.User?.firstName || "";
    const carName = contract.carAbo?.displayName || "Ihr Fahrzeug";
    const expiryDate = signExpiresAt.toLocaleString("de-DE");
    const mailBody = `
      <p>Hallo ${customerFirstName},</p>
      <p>Ihr Vertrag für <strong>${carName}</strong> ist zur digitalen Unterschrift bereit.</p>
      <p>Bitte öffnen Sie den folgenden Link und unterschreiben Sie den Vertrag direkt im Browser:</p>
      <p><a href="${signingUrl}" style="display: inline-block; background-color: #82ba26; padding: 10px 14px; border-radius: 10px; color: #ffffff; text-decoration: none; font-weight: 700;">Vertrag jetzt unterschreiben</a></p>
      <p>Oder kopieren Sie diesen Link in Ihren Browser:<br><a href="${signingUrl}">${signingUrl}</a></p>
      <p>Der Link ist einmalig nutzbar und bis <strong>${expiryDate}</strong> gültig.</p>
      <p>Viele Grüße<br><strong>Ihr Grüne Flotte Team</strong></p>
    `;
    const generatedEmailContent = await generateEmailHtml(
      "Vertrag digital unterschreiben",
      mailBody,
    );
    if (!contract.User?.email) {
      return res.status(422).json({
        success: false,
        message: "Kunden-E-Mail fehlt. Signaturlink konnte nicht versendet werden.",
      });
    }
    await sendNotificationEmail(
      contract.User.email,
      null,
      "Ihre digitale Vertragsunterschrift - Gruene Flotte",
      generatedEmailContent,
    );

    return res.status(201).json({
      success: true,
      message: "Signaturlink wurde versendet",
      signStatus: "pending_signature",
      signExpiresAt,
      signingUrl,
    });
  } catch (error) {
    console.error("Issue sign link error:", error);
    return res.status(500).json({
      success: false,
      message: "Interner Serverfehler",
      error: error.message,
    });
  }
};

exports.getSignContractByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const resolved = await resolveSignContractByToken(token);
    if (!resolved.contract) {
      return res.status(404).json({
        success: false,
        reason: resolved.reason || "invalid",
        message: "Ungueltiger Signaturlink.",
      });
    }
    if (resolved.reason && resolved.reason !== "valid") {
      const statusMap = {
        expired: 410,
        used: 410,
        signed: 410,
      };
      return res.status(statusMap[resolved.reason] || 400).json({
        success: false,
        reason: resolved.reason,
        message:
          resolved.reason === "expired"
            ? "Signaturlink ist abgelaufen."
            : resolved.reason === "signed"
              ? "Vertrag wurde bereits signiert."
              : "Signaturlink wurde bereits verwendet.",
      });
    }

    const contract = resolved.contract;
    return res.status(200).json({
      success: true,
      contract: {
        id: contract.id,
        customerName: `${contract.User?.firstName || ""} ${contract.User?.lastName || ""}`.trim(),
        customerEmail: contract.User?.email || "",
        carName: contract.carAbo?.displayName || "",
        monthlyPrice: contract.monthlyPrice,
        duration: contract.duration,
        startingDate: contract.startingDate,
        signExpiresAt: contract.signExpiresAt,
        previewUrl: `/contracts/sign/public/${encodeURIComponent(
          resolved.normalizedToken,
        )}/preview`,
      },
    });
  } catch (error) {
    console.error("Get sign contract error:", error);
    return res.status(500).json({
      success: false,
      message: "Interner Serverfehler",
      error: error.message,
    });
  }
};

exports.getSignContractPreviewByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const resolved = await resolveSignContractByToken(token);
    if (!resolved.contract) {
      return res.status(410).json({
        success: false,
        reason: resolved.reason || "invalid",
        message: "Signaturlink ist ungueltig, abgelaufen oder bereits genutzt.",
      });
    }
    if (resolved.reason && resolved.reason !== "valid" && resolved.reason !== "signed") {
      return res.status(410).json({
        success: false,
        reason: resolved.reason || "invalid",
        message: "Signaturlink ist ungueltig, abgelaufen oder bereits genutzt.",
      });
    }
    const activeFile = resolveActiveContractFileName(resolved.contract);
    if (!activeFile) {
      const generatedFile = await generateContractPdf(resolved.contract);
      await resolved.contract.update({ contractFile: generatedFile });
      return sendContractFileByName(res, generatedFile);
    }
    return sendContractFileByName(res, activeFile);
  } catch (error) {
    console.error("Get sign contract preview error:", error);
    return res.status(500).json({
      success: false,
      message: "Interner Serverfehler",
      error: error.message,
    });
  }
};

exports.submitContractSignature = async (req, res) => {
  const { token } = req.params;
  const { signatureDataUrl, fullName, acceptTerms, acceptPrivacy } = req.body || {};

  if (!signatureDataUrl || typeof signatureDataUrl !== "string") {
    return res.status(400).json({ success: false, message: "Signatur fehlt." });
  }
  if (!fullName || typeof fullName !== "string") {
    return res.status(400).json({ success: false, message: "Vollstaendiger Name fehlt." });
  }
  if (!acceptTerms || !acceptPrivacy) {
    return res.status(400).json({ success: false, message: "Pflichtbestaetigungen fehlen." });
  }
  const match = signatureDataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return res.status(400).json({ success: false, message: "Signaturformat ungueltig." });
  }
  const signatureBuffer = Buffer.from(match[1], "base64");
  if (!signatureBuffer.length || signatureBuffer.length > SIGNATURE_MAX_BYTES) {
    return res.status(400).json({ success: false, message: "Signatur ist leer oder zu gross." });
  }

  try {
    const resolved = await resolveSignContractByToken(token);
    if (!resolved.contract || resolved.reason !== "valid") {
      return res.status(410).json({
        success: false,
        reason: resolved.reason || "invalid",
        message: "Signaturlink ist ungueltig, abgelaufen oder bereits genutzt.",
      });
    }

    const clientIp =
      req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;
    const userAgent = req.headers["user-agent"] || null;
    const signedAt = new Date();
    const signaturesDir = path.join(__dirname, "../internal-files/signatures");
    await fs.promises.mkdir(signaturesDir, { recursive: true });
    const signatureFileName = `signature_${resolved.contract.id}_${Date.now()}.png`;
    const signaturePath = path.join(signaturesDir, signatureFileName);
    await fs.promises.writeFile(signaturePath, signatureBuffer);

    const sourceFileName = resolveActiveContractFileName(resolved.contract);
    const signedContractFile = await generateContractPdf(resolved.contract, {
      signatureImageBuffer: signatureBuffer,
      signedAt,
      signatureFullName: fullName.trim(),
      signatureIp: clientIp,
      filePrefix: "vertrag_signiert",
      sourceFileName,
    });

    await resolved.contract.update({
      signStatus: "signed",
      signTokenUsedAt: signedAt,
      signedAt,
      signatureImagePath: signatureFileName,
      signedContractFile,
      signatureIp: clientIp,
      signatureUserAgent: userAgent,
      signatureFullName: fullName.trim(),
      signTokenHash: resolved.tokenHash || resolved.contract.signTokenHash,
    });

    await contractSignedAdminNotification(resolved.contract.id);

    return res.status(200).json({
      success: true,
      message: "Vertrag erfolgreich signiert.",
      signedPreviewUrl: `/contracts/sign/public/${encodeURIComponent(
        resolved.normalizedToken,
      )}/preview`,
    });
  } catch (error) {
    console.error("Submit signature error:", error);
    return res.status(500).json({
      success: false,
      message: "Interner Serverfehler",
      error: error.message,
    });
  }
};

exports.deleteContract = async (req, res) => {
  const id = req.params.id;
  try {
    let contract = await db.Contract.findOne({ where: { id } });
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }
    if (
      contract.userId !== req.user.id &&
      req.user.role !== "ADMIN" &&
      req.user.role !== "SELLER"
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    let deletedContract = await db.Contract.destroy({ where: { id } });
    res.status(201).json({
      message: "Contract deleted successfully",
      deletedContractId: id,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
