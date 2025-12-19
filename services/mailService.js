const nodemailer = require("nodemailer");

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

  const info = await transporter.sendMail({
    from: '"Elias Englen" <info@elias-englen.de>', // sender address
    to: email, // list of receivers
    subject: "Dein Verifizierungscode", // Subject line
    text: `Dein Code ist: ${code}`, // plain text body
    html: `<b>Dein Code ist: ${code}</b>`, // html body
  });

  console.log("Message sent: %s", info.messageId);
};
