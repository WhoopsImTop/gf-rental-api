const db = require("../models");
const path = require("path");
const fs = require("fs");
const {
  generateEmailHtml,
  sendEmail,
  sendNotificationEmail,
} = require("../services/mailService");
const { logger } = require("../services/logging");
const { getGeoData } = require("../services/geoCoder");
const { generateContractPdf } = require("../services/export/contractExport");

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
    customerDetails, // birthday, street, housenumber, postalCode, city, country, driversLicenseNumber, IdCardNumber, newsletter, consents
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
        res.status(400).json({
          message: "No UserId Provided. Please try again",
        });
      }

      // 1. Create or Update CustomerDetails
      let details = await db.CustomerDetails.findOne({
        where: { userId },
        transaction,
      });

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

      let selectedPrice = null;

      if (Cart.priceId && Cart.car && Cart.car.prices) {
        selectedPrice = Cart.car.prices.find(
          (price) => price.id === Cart.priceId,
        );
      }

      const duration = selectedPrice.durationMonths;
      const monthlyPrice = Cart.withDeposit
        ? selectedPrice.priceWithDeposit
        : selectedPrice.priceNoDeposit;
      const totalCost = duration * monthlyPrice;

      const contract = await db.Contract.create(
        {
          userId,
          duration: contractData.duration,
          monthlyPrice: contractData.monthlyPrice,
          totalCost: contractData.totalCost,
          startingDate: contractData.startingDate,
          insurancePackage: contractData.insurancePackage || false,
          insuranceCosts: contractData.insuranceCosts || 0,
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
          monthlyPrice: monthlyPrice,
          totalCost: totalCost,
          orderCompleted: false,
          carAboId: Cart.carAboId,
          colorId: Cart.colorId,
          priceId: Cart.priceId,
          withDeposit: Cart.withDeposit,
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
        where: {
          id: contract.carAboId,
        },
      });

      const emailContent = `
      <p>Hiermit bestätigen wir Ihr Abo Abo. Den Mietvertrag werden wir Ihnen in Kürze per Email senden.</p>
      <p><strong>Um die Übergabe zu erleichtern, schicken Sie uns Bitte eine Kopie der Vorder- und Rückseite ihres Personalausweises und Führerscheins zu.</strong></p>
      <p><a href="mailto:info@gruene-flotte-auto-abo.de" style="background-color: #82ba26; padding: 16px 8px; border-radius: 12px; color: #ffffff;">info@gruene-flotte-auto-abo.de</a></p>
      <h2 style="font-weight: 900">Ihre Daten</h2>
      <table>
        <tbody>
          <tr><td>Vorname</td><td>${user.firstName}</td></tr>
          <tr><td>Nachname</td><td>${user.lastName}</td></tr>
          <tr><td>Straße</td><td>${user?.customerDetails?.street || ''} ${
            user?.customerDetails?.housenumber || ''
          }</td></tr>
          <tr><td>PLZ</td><td>${user?.customerDetails?.postalCode || ''}</td></tr>
          <tr><td>Ort</td><td>${user?.customerDetails?.city || ''}</td></tr>
          <tr><td>Telefon</td><td>${user.phone || ''}</td></tr>
          <tr><td>Email</td><td>${user.email || ''}</td></tr>
          <tr><td>Wunschstarttermin</td><td>${
            contract.startingDate
              ? new Date(contract.startingDate).toLocaleDateString("de-DE", {
                  day: "numeric",
                  month: "long",
                  year: "2-digit",
                })
              : "-"
          }</td></tr>
          <tr><td>Sicherheitspaket</td><td>${
            contract.insurancePackage ? "Ja" : "Nein"
          }</td></tr>
          <tr><td>Vertragslaufzeit</td><td>${contract.duration} ${
            contract.duration > 1 ? "Monate" : "Monat"
          }</td></tr>
          <tr><td>Führerscheinnummer</td><td>${
            user.customerDetails.driversLicenseNumber
          }</td></tr>
          <tr><td>Personalausweisnummer</td><td>${
            user.customerDetails.IdCardNumber
          }</td></tr>
          <tr><td>Monatliche Rate</td><td>${contract.monthlyPrice} €</td></tr>
        </tbody>
      </table>
      <p>Die erste Rate wird in den nächsten Tagen von deinem Konto abgebucht.</p>
      <p>Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung.</p>
      <p>Wir wünschen Ihnen viel Spaß mit Ihrem neuen Auto Abo.<br>
      Ihr Grüne Flotte Team</p>`;
      const generatedEmailContent = await generateEmailHtml(
        "Ihre Auto Abo Bestellung",
        user.customerDetails.firstname,
        emailContent,
      );
      const emailSent = await sendNotificationEmail(
        user.email,
        "Ihre Auto Abo Bestellung - Grüne Flotte Auto Abo",
        generatedEmailContent,
      );
      if (!emailSent) {
        logger(
          "error",
          "Email konnte nicht versendet werden Contract: #" + Contract.id,
        );
      }

      return contract;
    });

    res.status(201).json({
      message: "Contract created successfully",
      contractId: result.id,
    });
  } catch (error) {
    console.error("Error creating contract:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};

exports.archiveContract = async (req, res) => {
  const id = req.params.id;
  try {
    let contract = await db.Contract.findOne({ where: { id } });
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
    res.status(500).json({ error: "PDF konnte nicht erstellt werden" });
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
