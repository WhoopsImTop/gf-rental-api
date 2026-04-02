const db = require("../models");
const path = require("path");
const fs = require("fs");
const { logger } = require("../services/logging");
const {
  generateEmailHtml,
  sendErrorEmail,
  sendNotificationEmail,
} = require("../services/mailService");
const { getGeoData } = require("../services/geoCoder");
const { generateContractPdf } = require("../services/export/contractExport");
const { orderAdminNotification } = require("../services/notification/order");
const { getUserScore } = require("../services/auth/personalScore");

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

    res.status(201).json({
      message: "Contracts fetched Successfully",
      contracts: contracts,
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
      const licenseIssuedOn = new Date(customerDetails.licenseIssuedOn);
      const licenseValidUntil = new Date(customerDetails.licenseValidUntil);

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
        console.log(userScore.score, settings.allowedScore);
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
          accountHolderName: paymentData.accountHolderName,
          iban: paymentData.iban,
          sepaMandate: paymentData.sepaMandate || false,
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
        await db.CarAboColor.update(
          { isOrdered: true },
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

      const emailContent = `
<img src="${autoAbo.colors[0].media.url}" width="100%" height="auto"/>
<p>Guten Tag Herr ${user.lastName + "," ?? ""}</p>
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
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Wunschstarttermin</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            contract.startingDate
              ? new Date(contract.startingDate).toLocaleDateString("de-DE", {
                  day: "numeric",
                  month: "long",
                  year: "2-digit",
                })
              : "-"
          }</td></tr>
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

    res.json({ success: true, file: pdfFileName });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "PDF konnte nicht erstellt werden",
      errorMessage: err,
    });
  }
};

exports.viewContractFile = async (req, res) => {
  try {
    const { filename } = req.params;
    const userId = req.user.id; // Aus dem JWT Token
    const userRole = req.user.role;
    console.log(filename, userId, userRole);
    // 1. DB-Check: Gehört die Datei dem User? (Schutz gegen IDOR)
    const contract = await db.Contract.findOne({
      where: { contractFile: filename },
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
    const filePath = path.join(
      __dirname,
      "../internal-files/contracts",
      filename,
    );

    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ error: "Datei auf dem Server nicht gefunden." });
    }

    // 3. Datei sicher senden
    res.sendFile(filePath);
  } catch (error) {
    console.error("Download Error:", error);
    res.status(500).json({ error: "Interner Serverfehler." });
  }
};

exports.shareContractFile = async (req, res) => {
  try {
    const { accessKey } = req.params;

    const contract = await db.Contract.findOne({ where: { accessKey } });

    if (!contract) {
      return res.status(401).json({ error: "Ungültiger Zugriffsschlüssel." });
    }

    const filePath = path.join(
      __dirname,
      "../internal-files/contracts",
      contract.contractFile,
    );
    res.sendFile(filePath);
  } catch (error) {
    console.error("Download Error:", error);
    res.status(500).json({ error: "Interner Serverfehler." });
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
