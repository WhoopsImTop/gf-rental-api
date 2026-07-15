const db = require("../models");
const {
  generateEmailHtml,
  sendNotificationEmail,
} = require("../services/mailService");
const { escapeHtml } = require("../services/util/escapeHtml");

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

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

exports.resendConfirmation = async (req, res) => {
  const id = req.params.id;
  try {
    const contract = await db.Contract.findOne({ where: { id: id } });
    if (!contract) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }
    const isOwner = contract.userId === req.user.id;
    const isStaff =
      req.user.role === "ADMIN" || req.user.role === "SELLER";
    if (!isOwner && !isStaff) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const user = await db.User.findOne({
      include: [{ model: db.CustomerDetails, as: "customerDetails" }],
      where: { id: contract.userId },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (!user.customerDetails) {
      return res.status(404).json({ success: false, message: "Customer details not found" });
    }
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
      <p>Hallo ${escapeHtml(user.firstName)},</p>
      <p>Hiermit bestätigen wir Ihr Abo Abo. Den Mietvertrag werden wir Ihnen in Kürze per Email senden.</p>
      <p><strong>Um die Übergabe zu erleichtern, schicken Sie uns Bitte eine Kopie der Vorder- und Rückseite ihres Personalausweises und Führerscheins zu.</strong></p>
      <p><a href="mailto:info@gruene-flotte-auto-abo.de" style="display: inline-block; background-color: #82ba26; padding: 8px 16px; border-radius: 12px; color: #ffffff; text-decoration: none; font-weight: 900;">info@gruene-flotte-auto-abo.de</a></p>
      <hr style="margin: 10px; border: 1px solid #efefef;"/>
      <h2 style="font-weight: 900; margin: 0; padding: 0;">Ihre Daten</h2>
      <table style="width: 100%; border: 1px solid #efefef;">
        <tbody>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Vorname</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.firstName)}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Nachname</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.lastName)}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Straße</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.customerDetails.street)} ${escapeHtml(user.customerDetails.housenumber)
      }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">PLZ</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.customerDetails.postalCode)}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Ort</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.customerDetails.city)}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Telefon</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.phone)}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Email</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.email)}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Wunschstarttermin</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${formatContractStartingDate(contract.startingDate)}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Sicherheitspaket</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${contract.insuranceType === "premium" ? "Premium" : (contract.insuranceType === "basic" ? "Basic" : (contract.insurancePackage ? "Ja" : "Nein"))
      }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Vertragslaufzeit</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${contract.duration} ${contract.duration > 1 ? "Monate" : "Monat"
      }</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Führerscheinnummer</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.customerDetails.driversLicenseNumber
      )}</td></tr>
          <tr><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">Personalausweisnummer</td><td style="padding: 8px 16px; margin: 0; border-bottom: 1px solid #efefef">${escapeHtml(user.customerDetails.IdCardNumber
      )}</td></tr>
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
      generatedEmailContent,
      null,
      {
        mailType: "notification",
        context: { relatedUserId: user.id, relatedContractId: contract.id },
      },
    );
    return res
      .status(201)
      .json({ success: true, message: "Email sucessfully sent" });
  } catch (error) {
    return res.status(500).send({ error: "Internal server error" });
  }
};

exports.sendCustomEmail = async (req, res) => {
  const { title, message, email, cc } = req.body;
  try {
    if (!title || !message || !email) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email" });
    }
    if (cc && !isValidEmail(cc)) {
      return res.status(400).json({ success: false, message: "Invalid CC email" });
    }
    if (String(title).length > 180 || String(message).length > 10000) {
      return res.status(400).json({ success: false, message: "Email content too long" });
    }

    const generatedEmailContent = await generateEmailHtml(
      title,
      message
    );
    return res
      .status(201)
      .json({ success: true, message: "Email sucessfully sent" });
  } catch (error) {
    return res.status(500).send({ error: "Internal server error" });
  }
};

const EMAIL_LOG_LIST_ATTRIBUTES = [
  "id",
  "mailType",
  "fromAddress",
  "toAddress",
  "ccAddress",
  "subject",
  "attachmentCount",
  "messageId",
  "status",
  "errorMessage",
  "relatedUserId",
  "relatedContractId",
  "createdAt",
];

const EMAIL_LOG_DETAIL_ATTRIBUTES = [
  ...EMAIL_LOG_LIST_ATTRIBUTES,
  "bodyText",
  "bodyHtml",
  "attachmentMeta",
  "updatedAt",
];

const VALID_MAIL_TYPES = new Set([
  "otp",
  "password_reset",
  "notification",
  "error",
  "custom",
  "contact",
  "feedback",
  "admin_notification",
]);

const VALID_STATUSES = new Set(["sent", "failed", "skipped_dev"]);

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

exports.listEmailLogs = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 1000);
    const limit = parsePositiveInt(req.query.limit, 25, 100);
    const offset = (page - 1) * limit;

    const where = {};

    if (req.query.mailType && VALID_MAIL_TYPES.has(String(req.query.mailType))) {
      where.mailType = String(req.query.mailType);
    }

    if (req.query.status && VALID_STATUSES.has(String(req.query.status))) {
      where.status = String(req.query.status);
    }

    const search = String(req.query.search || "").trim();
    if (search) {
      const { Op } = db.Sequelize;
      where[Op.or] = [
        { toAddress: { [Op.like]: `%${search}%` } },
        { subject: { [Op.like]: `%${search}%` } },
        { fromAddress: { [Op.like]: `%${search}%` } },
      ];
    }

    const { rows, count } = await db.EmailLog.findAndCountAll({
      where,
      attributes: EMAIL_LOG_LIST_ATTRIBUTES,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.status(200).json({
      logs: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getEmailLogById = async (req, res) => {
  try {
    const log = await db.EmailLog.findByPk(req.params.id, {
      attributes: EMAIL_LOG_DETAIL_ATTRIBUTES,
    });

    if (!log) {
      return res.status(404).json({ error: "Email log not found" });
    }

    return res.status(200).json({ log });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};
