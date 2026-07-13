const db = require("../../models");
const { logger } = require("../logging");
const { generateEmailHtml, sendNotificationEmail } = require("../mailService");
const { escapeHtml } = require("../util/escapeHtml");

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

exports.orderAdminNotification = async (id) => {
  try {
    const setting = await db.Setting.findOne();
    if (!setting?.notificationEmails) {
      logger(
        "error",
        `orderAdminNotification: notificationEmails fehlen (Contract #${id})`,
      );
      return false;
    }

    const contract = await db.Contract.findOne({ where: { id } });
    const price = await db.CarAboPrice.findOne({
      where: { id: contract.priceId },
    });
    if (!contract) {
      logger("error", `orderAdminNotification: Contract #${id} nicht gefunden`);
      return false;
    }

    const user = await db.User.findOne({
      include: [{ model: db.CustomerDetails, as: "customerDetails" }],
      where: { id: contract.userId },
    });
    if (!user) {
      logger(
        "error",
        `orderAdminNotification: User für Contract #${id} nicht gefunden`,
      );
      return false;
    }

    const autoAbo = await db.CarAbo.findOne({
      include: [
        {
          model: db.CarAboColor,
          as: "colors",
          include: [{ model: db.Media, as: "media" }],
          where: { id: contract.colorId },
          required: false,
        },
      ],
      where: {
        id: contract.carAboId,
      },
    });

    const previewImageUrl = autoAbo?.colors?.[0]?.media?.url || "";
    const vehicleInternalId = autoAbo?.colors?.[0]?.internalId || "-";
    const isBusinessOrder =
      contract.customerType === "business" ||
      Boolean(user.customerDetails?.companyName);

    const emailContent = `
${previewImageUrl ? `<img src="${escapeHtml(previewImageUrl)}" width="100%" height="auto"/>` : ""}
${vehicleInternalId !== "-" ? `<span>Fahrzeug ID (${escapeHtml(vehicleInternalId)})</span>` : ""}
      <h2 style="font-weight: 900; margin: 0; padding: 0;">Neues Auto Abo!</h2>
      <p>Hallo Grüne Flotte Abo-Team, es wurde ein neues Auto Abo abgeschlossen.</p>
      ${isBusinessOrder ? "<p><strong>Geschäftskunden-Bestellung</strong> – Bonitätsprüfung manuell durchführen.</p>" : ""}
      <hr style="margin: 10px; border: 1px solid #efefef;"/>
      <table style="width: 100%; border: 1px solid #efefef;">
        <tbody>
          ${
            isBusinessOrder
              ? `<tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Unternehmensname</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.customerDetails?.companyName || "")}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Ansprechpartner</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.firstName || "")} ${escapeHtml(user.lastName || "")}</td></tr>`
              : `<tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Vorname</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.firstName || "")}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Nachname</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.lastName || "")}</td></tr>`
          }
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Straße</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.customerDetails?.street || "")} ${escapeHtml(user.customerDetails?.housenumber || "")}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">PLZ</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.customerDetails?.postalCode || "")}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Ort</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.customerDetails?.city || "")}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">E-Mail</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.email || "")}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Wunschstarttermin</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${formatContractStartingDate(contract.startingDate)}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Vertragslaufzeit</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${contract.duration} ${contract.duration > 1 ? "Monate" : "Monat"}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Kilometerleistung</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${ price?.mileageKm || ""} km</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Anzahlung</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${parseFloat(contract.depositValue).toFixed(2)} €</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Laufzeit Typ</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${contract.durationType}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Sicherheitspaket</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${contract.insuranceType}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0;">Monatliche Rate</td><td style="padding: 8px 16px; margin: 0;">${parseFloat(contract.monthlyPrice).toFixed(2)} €</td></tr>
        </tbody>
      </table>
      <p>Bitte überprüfe die Bestellung, generiere den Vertrag und sende den vervollständigten Vertrag an den Kunden.</p>
      <p>Zur Info: Der Kunde hat gleichzeitig eine automatisierte E-Mail mit der Zusammenfassung seines Auto Abos erhalten.</p>
      ${isBusinessOrder ? "<p>Bei Geschäftskunden: Bitte zuerst die manuelle Bonitätsprüfung durchführen, bevor der Vertrag versendet wird.</p>" : "<p>Darin wird der Kunde aufgefordert Kopien von Führerschein/Personalausweis und Details zur Uhrzeit der Abholung/Lieferung zu senden.</p><p>Sollte dies nicht die nächsten Tage passieren, bitte Kontakt aufnehmen und offene Punkte klären.</p>"}`;

    const displayName = autoAbo?.displayName || "Auto Abo";
    const generatedEmailContent = await generateEmailHtml(
      "Neue Auto Abo Bestellung " + displayName,
      emailContent,
    );

    const emailSent = await sendNotificationEmail(
      setting.notificationEmails,
      null,
      `Neue Auto Abo Bestellung(${autoAbo?.vehicleStatus === "new" ? "Neuwagen" : "Gebrauchtwagen"}) ${displayName}`,
      generatedEmailContent,
    );

    if (!emailSent) {
      logger(
        "error",
        `orderAdminNotification: Versand fehlgeschlagen (Contract #${id})`,
      );
    }

    return emailSent;
  } catch (error) {
    logger(
      "error",
      `orderAdminNotification: ${error.message} (Contract #${id})`,
    );
    return false;
  }
};

exports.contractSignedAdminNotification = async (id) => {
  try {
    const setting = await db.Setting.findOne();
    const contract = await db.Contract.findOne({ where: { id } });
    if (!setting?.notificationEmails || !contract) return;

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
          required: false,
        },
      ],
      where: { id: contract.carAboId },
    });

    const previewImageUrl = autoAbo?.colors?.[0]?.media?.url || "";
    const signedAtLabel = contract.signedAt
      ? new Date(contract.signedAt).toLocaleString("de-DE")
      : "-";

    const emailContent = `
${previewImageUrl ? `<img src="${escapeHtml(previewImageUrl)}" width="100%" height="auto"/>` : ""}
<h2 style="font-weight: 900; margin: 0; padding: 0;">Vertrag digital unterschrieben</h2>
<p>Der Kunde hat den Vertrag erfolgreich digital unterschrieben.</p>
<hr style="margin: 10px; border: 1px solid #efefef;"/>
<table style="width: 100%; border: 1px solid #efefef;">
  <tbody>
    <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Vertragsnummer</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${contract.id}</td></tr>
    <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Name</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user?.firstName || "")} ${escapeHtml(user?.lastName || "")}</td></tr>
    <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">E-Mail</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user?.email || "-")}</td></tr>
    <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Fahrzeug</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(autoAbo?.displayName || "-")}</td></tr>
    <tr><td style="padding: 8px 16px; margin: 0;">Signiert am</td><td style="padding: 8px 16px; margin: 0;">${signedAtLabel}</td></tr>
  </tbody>
</table>
<p>Bitte prüft den signierten Vertrag in der Vertragsverwaltung und startet die weiteren Schritte.</p>
`;

    const generatedEmailContent = await generateEmailHtml(
      `Vertrag digital unterschrieben #${contract.id}`,
      emailContent,
    );

    await sendNotificationEmail(
      setting.notificationEmails,
      null,
      `Vertrag unterschrieben: ${autoAbo?.displayName || "Auto Abo"} (#${contract.id})`,
      generatedEmailContent,
    );
  } catch (error) {
    console.log(error);
  }
};
