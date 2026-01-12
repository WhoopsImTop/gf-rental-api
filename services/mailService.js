const nodemailer = require("nodemailer");
const handlebars = require('handlebars');

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

exports.sendEmail = async (message) => {
  const info = await transporter.sendMail({
    from: '"Elias Englen" <info@elias-englen.de>', // sender address
    to: "englen@khri8.com", // list of receivers
    subject: "Auto Abo Prozess error", // Subject line
    text: `${sendEmail}`, // plain text body
    html: `${sendEmail}`, // html body
  });

  console.log("Message sent: %s", info.messageId);
};

const generateEmailHtml = (title, firstname, contentHtml) => {
    try {
        // 1. Pfad zur Datei definieren
        const templatePath = path.join(__dirname, '../templates/mail/default.hbs');

        // 2. Datei einlesen
        const source = fs.readFileSync(templatePath, 'utf8');

        // 3. Template kompilieren
        const template = handlebars.compile(source);

        // 4. Daten mappen
        const data = {
            EMAILTITLE: title,
            FIRSTNAME: firstname,
            EMAILCONTENT: contentHtml // Hier übergeben wir HTML-Code!
        };

        // 5. Fertiges HTML zurückgeben
        return template(data);

    } catch (error) {
        console.error('Fehler beim Generieren des Email-Templates:', error);
        throw error;
    }
};