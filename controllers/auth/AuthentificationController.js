const bcrypt = require("bcrypt");
const { createToken } = require("../../services/auth/tokenService");
const { User, Session } = require("../../models"); // Importiere das User-Modell

exports.registerUser = async (req, res) => {
  const { firstName, lastName, email, phone, password, role } = req.body;

  try {
    // Prüfe, ob der Benutzer bereits existiert
    const existingUser = await User.scope('withPassword').findOne({ where: { email } });
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
    // Benutzer anhand der Email suchen
    const user = await User.scope('withPassword').findOne({ where: { email } });
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
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 Stunde Gültigkeit
    await Session.create({ userId: user.id, token, expiresAt });

    res.json({ token });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
