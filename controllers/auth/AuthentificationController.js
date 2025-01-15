const bcrypt = require("bcrypt");
const { createToken } = require("../../services/auth/tokenService");
const { User, Session } = require("../../models"); // Importiere das User-Modell
const { createHash } = require("../../services/encryption");

exports.registerUser = async (req, res) => {
  const { firstName, lastName, email, phone, password, role } = req.body;

  try {
    const emailHash = createHash(email);
    // Prüfe, ob der Benutzer bereits existiert
    const existingUser = await User.scope("withPassword").findOne({
      where: { emailHash },
    });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Passwort hashen
    const hashedPassword = await bcrypt.hash(password, 10);

    // Benutzer erstellen
    const newUser = await User.create({
      firstName,
      lastName,
      email,
      emailHash: emailHash,
      phone,
      passwordHash: hashedPassword,
      role: role || "customer",
    });

    res
      .status(201)
      .json({ message: "User registered successfully", userId: newUser.id });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const emailHash = createHash(email);
    // Benutzer anhand der Email suchen
    const user = await User.scope("withPassword").findOne({ where: { emailHash } });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Passwort prüfen
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Bestehende Sessions des Benutzers löschen (optional)
    await Session.destroy({ where: { userId: user.id } });

    // JWT erstellen
    const token = createToken({ userId: user.id, role: user.role });

    // Session in der Datenbank speichern
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000); // 24 Stunden
    await Session.create({ userId: user.id, token, expiresAt });

    res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
