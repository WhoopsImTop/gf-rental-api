exports.subscribeToNewsletter = async (req, res) => {
  try {
    //check if request was from *gruene-flotte.com domain
    if (!req.headers.referer.includes("gruene-flotte.com")) {
      return res.status(403).json({ error: "Forbidden" });
    }
    //check if email is valid
    if (!req.body.email || !req.body.email.includes("@")) {
      return res.status(400).json({ error: "Invalid email" });
    }
    //make api call to brevo to subscribe to newsletter
    const response = await fetch("https://api.brevo.com/v3/contacts/doubleOptinConfirmation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        email: req.body.email,
        includeListIds: [2],
        redirectionUrl: "https://gruene-flotte.com/carsharing",
        templateId: 2,
      }),
    });

    if (!response.ok || (response.status !== 201 && response.status !== 204)) {
      return res.status(500).json({ error: "Failed to subscribe to newsletter" });
    }

    return res.status(201).json({ message: "Subscribed to newsletter" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
