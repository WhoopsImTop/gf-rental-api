const nodemailer = require("nodemailer");
const handlebars = require("handlebars");
const path = require("path");
const fs = require("fs");
const db = require("../models");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.example.com",
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

exports.sendOtpEmail = async (email, code) => {
  if (!process.env.SMTP_HOST) {
    console.log(`[DEV MODE] OTP for ${email}: ${code}`);
    return;
  }

  const htmlContent = exports.generateEmailHtml(
    "Dein Grüne Flotte Verifizierungscode", // Titel der E-Mail
    `<p style="margin: 0; padding: 0;">Dein Code lautet: <b>${code}</b><br>
    <span style="font-size: 12px; color: #333333; line-height: 1em;">Dieser Code ist 10 Minuten gültig.</span></p>
    <br>
    <p style="margin: 0; padding: 0;">Sollten Sie keinen Code angefordert haben, können Sie diese Email ignorieren.</p>
    <br>
    <p style="margin: 0; padding: 0;"><strong>Mit freundlichen Grüßen</strong></p>
    <p style="margin: 0; padding: 0;">Ihr Grüne Flotte Team</p>`, // E-Mail Inhalt
  );

  const info = await transporter.sendMail({
    from: '"Grüne Flotte Auto Abo" <info@gruene-flotte-autoabo.de>',
    to: email,
    subject: "Dein Verifizierungscode",
    text: `Dein Code ist: ${code}`, // Fallback-Text
    html: htmlContent, // HTML-Content aus Template
  });

  console.log("Message sent: %s", info.messageId);
};

exports.sendPasswordResetEmail = async (email, code) => {
  if (!process.env.SMTP_HOST) {
    console.log(`[DEV MODE] Password reset code for ${email}: ${code}`);
    return;
  }

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

  const info = await transporter.sendMail({
    from: '"Grüne Flotte" <info@gruene-flotte-autoabo.de>',
    to: email,
    subject: "Passwort zurücksetzen – Dein Code",
    text: `Du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt. Dein Code lautet: ${code}. Dieser Code ist 10 Minuten gültig.`,
    html: htmlContent,
  });

  console.log("Password reset email sent: %s", info.messageId);
};

exports.sendErrorEmail = async (message) => {
  try {
    const info = await transporter.sendMail({
      from: '"Grüne Flotte Auto Abo" <info@gruene-flotte-autoabo.de>', // sender address
      to: "englen@khri8.com", // list of receivers
      subject: "Auto Abo Prozess error", // Subject line
      text: `${message}`, // plain text body
      html: `${message}`, // html body
    });

    console.log("Message sent: %s", info.messageId);
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
) => {
  try {
    const info = await transporter.sendMail({
      from: '"Grüne Flotte Auto Abo" <info@gruene-flotte-autoabo.de>', // sender address
      cc: cc,
      to: email, // list of receivers
      subject: title, // Subject line
      text: `${message}`, // plain text body
      html: `${message}`, // html body
      attachments: attachments,
    });

    console.log("Message sent: %s", info.messageId);
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
