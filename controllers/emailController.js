const db = require("../models");
const {
  generateEmailHtml,
  sendEmail,
  sendNotificationEmail,
} = require("../services/mailService");
const { logger } = require("../services/logging");

exports.resendConfirmation = async (req, res) => {
  const id = req.params.id;
  try {
    const contract = await db.Contract.findOne({ where: { id: id } });
    const user = await db.User.findOne({
      include: [{ model: db.CustomerDetails, as: "customerDetails" }],
      where: { id: contract.userId },
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
      <p>Hallo ${user.firstName + "," ?? ""}</p>
      <p>Hiermit bestätigen wir Ihr Abo Abo. Den Mietvertrag werden wir Ihnen in Kürze per Email senden.</p>
      <p><strong>Um die Übergabe zu erleichtern, schicken Sie uns Bitte eine Kopie der Vorder- und Rückseite ihres Personalausweises und Führerscheins zu.</strong></p>
      <p><a href="mailto:info@gruene-flotte-auto-abo.de" style="display: inline-block; background-color: #82ba26; padding: 8px 16px; border-radius: 12px; color: #ffffff; text-decoration: none; font-weight: 900;">info@gruene-flotte-auto-abo.de</a></p>
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
            contract.insurancePackage ? "Ja" : "Nein"
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Vertragslaufzeit</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${contract.duration} ${
      contract.duration > 1 ? "Monate" : "Monat"
    }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Führerscheinnummer</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            user.customerDetails.driversLicenseNumber
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Personalausweisnummer</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            user.customerDetails.IdCardNumber
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0;">Monatliche Rate</td><td style="padding: 8px 16px; margin: 0;">${contract.monthlyPrice} €</td></tr>
        </tbody>
      </table>
      <p>Die erste Rate wird in den nächsten Tagen von deinem Konto abgebucht.</p>
      <p>Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung.</p>
      <p style="margin-bottom:0">Wir wünschen Ihnen viel Spaß mit Ihrem neuen Auto Abo.<br>
      <strong>Ihr Grüne Flotte Team</strong></p>`;
    const generatedEmailContent = await generateEmailHtml(
      "Ihre Auto Abo Bestellung",
      emailContent
    );
    const emailSent = await sendNotificationEmail(
      user.email,
      null,
      "Ihre Auto Abo Bestellung - Grüne Flotte Auto Abo",
      generatedEmailContent
    );
    return res
      .status(201)
      .json({ success: true, message: "Email sucessfully sent" });
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.sendCustomEmail = async (req, res) => {
  const { title, message, email, cc } = req.body;
  try {
    const generatedEmailContent = await generateEmailHtml(
      title,
      message
    );
    const emailSent = await sendNotificationEmail(
      email,
      cc,
      title,
      generatedEmailContent
    );
    return res
      .status(201)
      .json({ success: true, message: "Email sucessfully sent" });
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};
