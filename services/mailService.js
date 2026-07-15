const nodemailer = require("nodemailer");
const handlebars = require("handlebars");
const path = require("path");
const fs = require("fs");
const db = require("../models");
const { buildLogPayload } = require("./mail/emailLogPayload");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.example.com",
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function persistEmailLog(logData) {
  try {
    await db.EmailLog.create(logData);
  } catch (error) {
    console.error("EmailLog persist failed:", error);
  }
}

const mailInternals = {
  persistEmailLog,
};

async function sendAndLog({ mailType, mailPayload, context = {} }) {
  const logEntry = buildLogPayload(mailType, mailPayload, context);

  if (!process.env.SMTP_HOST) {
    console.log(`[DEV MODE] Email skipped (${mailType})`);
    await mailInternals.persistEmailLog({ ...logEntry, status: "skipped_dev" });
    return { skipped: true };
  }

  try {
    const info = await transporter.sendMail(mailPayload);
    console.log("Message sent: %s", info.messageId);
    await mailInternals.persistEmailLog({
      ...logEntry,
      status: "sent",
      messageId: info.messageId ?? null,
    });
    return info;
  } catch (error) {
    await mailInternals.persistEmailLog({
      ...logEntry,
      status: "failed",
      errorMessage: error.message,
    });
    throw error;
  }
}

exports.sendOtpEmail = async (email, code, context = {}) => {
  const htmlContent = exports.generateEmailHtml(
    "Dein Grüne Flotte Verifizierungscode",
    `<p style="margin: 0; padding: 0;">Dein Code lautet: <b>${code}</b><br>
    <span style="font-size: 12px; color: #333333; line-height: 1em;">Dieser Code ist 10 Minuten gültig.</span></p>
    <br>
    <p style="margin: 0; padding: 0;">Sollten Sie keinen Code angefordert haben, können Sie diese Email ignorieren.</p>
    <br>
    <p style="margin: 0; padding: 0;"><strong>Mit freundlichen Grüßen</strong></p>
    <p style="margin: 0; padding: 0;">Ihr Grüne Flotte Team</p>`,
  );

  await sendAndLog({
    mailType: "otp",
    mailPayload: {
      from: '"Grüne Flotte Auto Abo" <info@gruene-flotte-autoabo.de>',
      to: email,
      subject: "Dein Verifizierungscode",
      text: `Dein Code ist: ${code}`,
      html: htmlContent,
    },
    context,
  });
};

exports.sendPasswordResetEmail = async (email, code, context = {}) => {
  const htmlContent = exports.generateEmailHtml(
    "Passwort zurücksetzen",
    `<p style="margin: 0; padding: 0;">Du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt.</p>
    <br>
    <p style="margin: 0; padding: 0;">Dein Code zum Zurücksetzen lautet:</p>
    <p style="margin: 10px 0; padding: 12px 20px; background-color: #f5f5f5; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center;">${code}</p>
    <p style="margin: 0; padding: 0;"><span style="font-size: 12px; color: #666666;">Dieser Code ist 10 Minuten gültig.</span></p>
    <br>
    <p style="margin: 0; padding: 0;">Falls du kein neues Passwort angefordert hast, kannst du diese E-Mail ignorieren. Dein Passwort bleibt unverändert.</p>
    <br>
    <p style="margin: 0; padding: 0;"><strong>Mit freundlichen Grüßen</strong></p>
    <p style="margin: 0; padding: 0;">Dein Grüne Flotte Team</p>`,
  );

  await sendAndLog({
    mailType: "password_reset",
    mailPayload: {
      from: '"Grüne Flotte" <info@gruene-flotte-autoabo.de>',
      to: email,
      subject: "Passwort zurücksetzen – Dein Code",
      text: `Du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt. Dein Code lautet: ${code}. Dieser Code ist 10 Minuten gültig.`,
      html: htmlContent,
    },
    context,
  });
};

exports.sendErrorEmail = async (message, context = {}) => {
  try {
    await sendAndLog({
      mailType: "error",
      mailPayload: {
        from: '"Grüne Flotte Auto Abo" <info@gruene-flotte-autoabo.de>',
        to: "englen@khri8.com",
        subject: "Auto Abo Prozess error",
        text: `${message}`,
        html: `${message}`,
      },
      context,
    });
    return true;
  } catch (error) {
    console.log("Errors:", error);
    return false;
  }
};

exports.sendNotificationEmail = async (
  email,
  cc = null,
  title,
  message,
  attachments = null,
  options = {},
) => {
  try {
    const plainText =
      options && typeof options === "object" && options.plainText != null
        ? options.plainText
        : null;

    const mailType =
      options && typeof options === "object" && options.mailType
        ? options.mailType
        : "notification";

    const mailPayload = {
      from: '"Grüne Flotte Auto Abo" <info@gruene-flotte-autoabo.de>',
      cc: cc,
      to: email,
      subject: title,
      attachments: attachments,
    };

    if (plainText != null) {
      mailPayload.text = String(plainText);
    } else {
      mailPayload.text = `${message}`;
      mailPayload.html = `${message}`;
    }

    await sendAndLog({
      mailType,
      mailPayload,
      context: options.context || {},
    });

    return true;
  } catch (error) {
    console.log("Errors:", error);
    return false;
  }
};

exports.generateEmailHtml = (title, contentHtml) => {
  try {
    const templatePath = path.join(__dirname, "../templates/mail/default.hbs");

    const source = fs.readFileSync(templatePath, "utf8");

    const template = handlebars.compile(source);

    const data = {
      EMAILTITLE: title,
      EMAILCONTENT: contentHtml,
    };

    return template(data);
  } catch (error) {
    console.error("Fehler beim Generieren des Email-Templates:", error);
    throw error;
  }
};

exports._internals = {
  buildLogPayload,
  extractAttachmentMeta: require("./mail/emailLogPayload").extractAttachmentMeta,
  sendAndLog,
  get persistEmailLog() {
    return mailInternals.persistEmailLog;
  },
  set persistEmailLog(fn) {
    mailInternals.persistEmailLog = fn;
  },
};
