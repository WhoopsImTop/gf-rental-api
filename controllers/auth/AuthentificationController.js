const bcrypt = require("bcrypt");
const { createToken } = require("../../services/auth/tokenService");
const { User, Session } = require("../../models"); // Importiere das User-Modell
const { createHash, encrypt } = require("../../services/encryption");
const { sendOtpEmail } = require("../../services/mailService");
const {
  authentificateWithCantamen,
  collectUserDataFromCantamen,
} = require("../../services/auth/cantamen");
const { VerificationCode } = require("../../models");

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
      role: role || "CUSTOMER",
    });

    res
      .status(201)
      .json({ message: "User registered successfully", userId: newUser.id });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.requestOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const emailHash = createHash(email);

    await VerificationCode.create({
      email,
      emailHash,
      code,
      expiresAt,
    });

    await sendOtpEmail(email, code);

    res.json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error requesting OTP:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.verifyOtp = async (req, res) => {
  const emailRaw = req.body.email;
  const emailHash = createHash(emailRaw);
  const code = req.body.code;

  try {
    const verification = await VerificationCode.findOne({
      where: { emailHash, code },
      order: [["createdAt", "DESC"]],
    });

    if (!verification || verification.expiresAt < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    let user = await User.scope("withPassword").findOne({
      where: { emailHash },
    });

    if (!user) {
      // Create new user without password
      // Important: Pass raw email, model will encrypt it. Pass hash explicitly.
      user = await User.create({
        email: emailRaw,
        emailHash: emailHash,
        role: "CUSTOMER",
      });
    }

    // Clean up used OTP (optional, or rely on expiration/cron)
    await verification.destroy();

    // Create Session
    const token = createToken({ userId: user.id, role: user.role });
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
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
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "Internal server error", error: error });
  }
};

exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const emailHash = createHash(email);
    // Benutzer anhand der Email suchen
    const user = await User.scope("withPassword").findOne({
      where: { emailHash },
    });
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

exports.verifyCantamenCredentials = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Nur Authentifizierung testen
    await authentificateWithCantamen(email, password);
    res.json({ message: "Credentials valid" });
  } catch (e) {
    console.error("Cantamen verify error:", e);
    // 401 Unauthorized ist passender für fehlgeschlagenen Login
    res.status(401).json({ message: "Invalid credentials" });
  }
};

exports.cantamenAuth = async (req, res) => {
  const { email, password } = req.body;

  try {
    const authData = await authentificateWithCantamen(email, password);
    const { userData, sepaMandate } = await collectUserDataFromCantamen(authData.id);

    console.log("Cantamen User Data:", userData);

    // 1. Prüfen ob User existiert
    const emailHash = createHash(userData.emailAddress);
    let user = await User.scope("withPassword").findOne({
      where: { emailHash },
    });

    if (!user) {
      const randomPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      user = await User.create({
        firstName: userData.prename,
        lastName: userData.name,
        email: userData.emailAddress,
        phone: userData.mobilePhoneNr,
        emailHash: emailHash,
        passwordHash: hashedPassword, // Dummy
        role: "CUSTOMER",
      });
    }

    // 3. Session und Token erstellen (wie in loginUser)
    await Session.destroy({ where: { userId: user.id } });
    const token = createToken({ userId: user.id, role: user.role });
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    await Session.create({ userId: user.id, token, expiresAt });

    // 4. Response zurückgeben
    res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        birthday: userData.birthDate ? new Date(userData.birthDate).toISOString().split('T')[0] : null, // Ensure YYYY-MM-DD
        birthPlace: userData.birthPlace,
        street: userData.address?.street,
        housenumber: userData.address?.streetNr,
        postalCode: userData.address?.postalCode,
        city: userData.address?.city,
        country: userData.address?.country,
        driversLicenseNumber: userData.driverlicenseNumber,
        IdCardNumber: userData.identityNumber,
        hasCantamenSepa: sepaMandate,
      },
      token,
    });

  } catch (e) {
    console.log(e);
    res.status(500).json({ error: e.message || "Internal server error" });
  }
};
