const { sendNotificationEmail } = require("../../services/mailService");

const CONTACT_TOPICS = {
  business: "Auto Abo Beratung",
  "camper-abo": "Camper Abo Anfrage",
};

const CAMPER_VEHICLES = [
  "Ford Nugget mit Hochdach",
  "Ford Nugget mit Aufstelldach",
];
const CAMPER_DURATIONS = [
  "2 Monate",
  "3 Monate",
  "6 Monate",
  "9 Monate",
  "12 Monate",
  "18 Monate",
  "24 Monate",
];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeLine(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 200);
}

exports.sendContactInquiry = async (req, res) => {
    try {
        //implement ddos protection and send email
        const {
            company,
            firstName,
            lastName,
            email,
            phone,
            message,
            topic,
            startDate,
            duration,
            vehicle,
        } = req.body;
        const isCamperInquiry = topic === "camper-abo";
        if (!firstName || !lastName || !email) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        if (isCamperInquiry && (!phone || !startDate || !duration || !vehicle)) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        if (
            isCamperInquiry &&
            (!CAMPER_VEHICLES.includes(vehicle) ||
                !CAMPER_DURATIONS.includes(duration) ||
                !DATE_PATTERN.test(String(startDate)))
        ) {
            return res.status(400).json({ error: "Invalid booking details" });
        }
        if (!isCamperInquiry && !message) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({ error: "Invalid email" });
        }
        if (message && String(message).length > 2000) {
            return res.status(400).json({ error: "Message too long" });
        }
        const subject = CONTACT_TOPICS[topic] || CONTACT_TOPICS.business;
        const safeName = `${sanitizeLine(firstName)} ${sanitizeLine(lastName)}`.trim();
        const safeCompany = sanitizeLine(company);
        const safePhone = sanitizeLine(phone);
        const formattedStartDate = DATE_PATTERN.test(String(startDate || ""))
            ? String(startDate).split("-").reverse().join(".")
            : sanitizeLine(startDate);
        const emailSent = await sendNotificationEmail(
            'autoabo@gruene-flotte.com',
            null,
            subject,
            "",
            null,
            {
                plainText: [
                  `Anfrage: ${subject}`,
                  `Name: ${safeName}`,
                  safeCompany ? `Unternehmen: ${safeCompany}` : null,
                  `Email: ${sanitizeLine(email)}`,
                  `Phone: ${safePhone}`,
                  vehicle ? `Fahrzeug: ${sanitizeLine(vehicle)}` : null,
                  startDate ? `Startdatum: ${formattedStartDate}` : null,
                  duration ? `Dauer: ${sanitizeLine(duration)}` : null,
                  message ? `Message: ${String(message).slice(0, 2000)}` : null,
                ]
                  .filter(Boolean)
                  .join("\n"),
                mailType: "contact",
            },
        );
        if (emailSent) {
            return res.status(200).json({ message: "Email sent successfully" });
        } else {
            return res.status(500).json({ error: "Failed to send email" });
        }
    } catch (error) {
        return res.status(500).json({ error: "An unexpected error occurred" });
    }
};
