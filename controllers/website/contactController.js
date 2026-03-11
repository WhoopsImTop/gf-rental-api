const { sendNotificationEmail } = require("../../services/mailService");

exports.sendContactInquiry = async (req, res) => {
    try {
        //implement ddos protection and send email
        const { company, firstName, lastName, email, phone, message } = req.body;
        if (!company || !firstName || !lastName || !email || !message) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        const emailSent = await sendNotificationEmail(
            'englen@khri8.com',
            null,
            "Auto Abo Beratung",
            `Name: ${firstName} ${lastName}\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`,
        );
        if (emailSent) {
            return res.status(200).json({ message: "Email sent successfully" });
        } else {
            return res.status(500).json({ error: "Failed to send email" });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
