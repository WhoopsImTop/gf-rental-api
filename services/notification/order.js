const db = require("../../models");
const path = require("path");
const fs = require("fs");
const { logger } = require("../logging");
const { generateEmailHtml, sendNotificationEmail } = require("../mailService");

exports.orderAdminNotification = async (id) => {
  try {
    const setting = await db.Setting.findOne();
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
      ],
      where: {
        id: contract.carAboId,
      },
    });
    const emailContent = `
<img src="${autoAbo.colors[0].media.url}" width="100%" height="auto"/>
<span>Fahrzeug ID (${autoAbo.colors[0].internalId})</span>
      <h2 style="font-weight: 900; margin: 0; padding: 0;">Neues Auto Abo!</h2>
      <p>Hallo Grüne Flotte Abo-Team, es wurde ein neues Auto Abo abgeschlossen.</p>
      <hr style="margin: 10px; border: 1px solid #efefef;"/>
      <table style="width: 100%; border: 1px solid #efefef;">
        <tbody>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Vorname</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            user.firstName
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Nachname</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            user.lastName
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Straße</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            user.customerDetails.street
          } ${user.customerDetails.housenumber}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">PLZ</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            user.customerDetails.postalCode
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Ort</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            user.customerDetails.city
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Wunschstarttermin</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            contract.startingDate
              ? new Date(contract.startingDate).toLocaleDateString("de-DE", {
                  day: "numeric",
                  month: "long",
                  year: "2-digit",
                })
              : "-"
          }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Vertragslaufzeit</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${
            contract.duration
          } ${contract.duration > 1 ? "Monate" : "Monat"}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0;">Monatliche Rate</td><td style="padding: 8px 16px; margin: 0;">${
            contract.monthlyPrice
          } €</td></tr>
        </tbody>
      </table>
      <p>Bitte überprüfe die Bestellung, generiere den Vertrag und sende den vervollständigten Vertrag an den Kunden.</p>
      <p>Zur Info: Der Kunde hat gleichzeitig eine automatisierte E-Mail mit der Zusammenfassung seines Auto Abos erhalten.</p>
      <p>Darin wird der Kunde aufgefordert Kopien von Führerschein/Personalausweis und Details zur Uhrzeit der Abholung/Lieferung zu senden.</p>
      <p>Sollte dies nicht die nächsten Tage passieren, bitte Kontakt aufnehmen und offene Punkte klären.</p>`;

    const generatedEmailContent = await generateEmailHtml(
      "Neue Auto Abo Bestellung " + autoAbo.displayName,
      emailContent,
    );
    const emailSent = await sendNotificationEmail(
      setting.notificationEmails,
      null,
      `Neue Auto Abo Bestellung(${
        autoAbo.vehicleStatus === "new" ? "Neuwagen" : "Gebrauchtwagen"
      }) ${autoAbo.displayName}`,
      generatedEmailContent,
    );
  } catch (error) {
    console.log(error);
  }
};
