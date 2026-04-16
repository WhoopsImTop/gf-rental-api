const bcrypt = require("bcrypt");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { generateSecret: generateTotpSecret, verifyCode: verifyTotpCode, generateURI: generateTotpURI } = require("../../services/auth/totpService");
const { createToken, verifyToken } = require("../../services/auth/tokenService");
const { User, Session, Cart } = require("../../models"); // Importiere das User-Modell
const { createHash, encrypt } = require("../../services/encryption");
const { sendOtpEmail, sendPasswordResetEmail } = require("../../services/mailService");
const {
  authentificateWithCantamen,
  collectUserDataFromCantamen,
} = require("../../services/auth/cantamen");
const { VerificationCode, PasswordResetCode } = require("../../models");

function extractIsoDate(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

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
      role: "CUSTOMER",
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
    const code = crypto.randomInt(100000, 1000000).toString();
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
      return res.status(400).json({
        message: "Der Code ist ungültig oder abgelaufen. Bitte fordere einen neuen Code an.",
      });
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

    if (!req.body.cartId) {
      return res.status(400).json({
        message:
          "Es wurde kein Warenkorb übermittelt. Bitte wähle ein Fahrzeug aus und konfiguriere dein Abo erneut.",
        code: "CART_REQUIRED",
      });
    }

    const cartRow = await Cart.findByPk(req.body.cartId);
    if (!cartRow) {
      return res.status(400).json({
        message:
          "Der Warenkorb wurde nicht gefunden oder ist nicht mehr gültig. Bitte starte die Buchung erneut.",
        code: "CART_NOT_FOUND",
      });
    }

    await Cart.update({ userId: user.id }, { where: { id: req.body.cartId } });

    res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
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

    // Wenn MFA aktiviert ist, temporären Token zurückgeben
    if (user.mfaEnabled) {
      const mfaToken = createToken({ userId: user.id, purpose: "mfa" });
      return res.json({ mfaRequired: true, mfaToken });
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

// ─── Password Reset ─────────────────────────────────────────────

exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  try {
    const emailHash = createHash(email);
    const user = await User.scope("withPassword").findOne({
      where: { emailHash },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: "If the email exists, a reset code has been sent" });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await PasswordResetCode.create({
      emailHash,
      code,
      expiresAt,
    });

    await sendPasswordResetEmail(email, code);

    res.json({ message: "If the email exists, a reset code has been sent" });
  } catch (error) {
    console.error("Error requesting password reset:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body;

  try {
    const emailHash = createHash(email);

    const resetCode = await PasswordResetCode.findOne({
      where: { emailHash, code },
      order: [["createdAt", "DESC"]],
    });

    if (!resetCode || resetCode.expiresAt < new Date()) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    const user = await User.scope("withPassword").findOne({
      where: { emailHash },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ passwordHash: hashedPassword });

    // Clean up used code
    await resetCode.destroy();

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─── MFA (TOTP) ─────────────────────────────────────────────────

exports.setupMfa = async (req, res) => {
  try {
    const user = await User.scope("withPassword").findByPk(req.user.id);

    if (user.mfaEnabled) {
      return res.status(400).json({ message: "MFA is already enabled" });
    }

    const secret = generateTotpSecret();
    const otpauthUrl = generateTotpURI(
      user.email || `user-${user.id}`,
      "Grüne Flotte CRM",
      secret
    );

    // Store the secret temporarily (not yet verified)
    await user.update({ mfaSecret: secret });

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    res.json({
      secret,
      qrCode: qrCodeDataUrl,
      otpauthUrl,
    });
  } catch (error) {
    console.error("Error setting up MFA:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.verifyMfaSetup = async (req, res) => {
  const { code } = req.body;

  try {
    const user = await User.scope("withPassword").findByPk(req.user.id);

    if (!user.mfaSecret) {
      return res.status(400).json({ message: "MFA setup not initiated" });
    }

    const isValid = verifyTotpCode(code, user.mfaSecret);

    if (!isValid) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    await user.update({ mfaEnabled: true });

    res.json({ message: "MFA enabled successfully" });
  } catch (error) {
    console.error("Error verifying MFA setup:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.verifyMfaLogin = async (req, res) => {
  const { mfaToken, code } = req.body;

  try {
    const decoded = verifyToken(mfaToken);
    if (!decoded || decoded.purpose !== "mfa") {
      return res.status(400).json({ message: "Invalid or expired MFA token" });
    }

    const user = await User.scope("withPassword").findByPk(decoded.userId);
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return res.status(400).json({ message: "MFA not configured" });
    }

    const isValid = verifyTotpCode(code, user.mfaSecret);

    if (!isValid) {
      return res.status(400).json({ message: "Invalid MFA code" });
    }

    // MFA verified — create full session
    await Session.destroy({ where: { userId: user.id } });
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
    console.error("Error verifying MFA login:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.disableMfa = async (req, res) => {
  const { code } = req.body;

  try {
    const user = await User.scope("withPassword").findByPk(req.user.id);

    if (!user.mfaEnabled) {
      return res.status(400).json({ message: "MFA is not enabled" });
    }

    const isValid = verifyTotpCode(code, user.mfaSecret);

    if (!isValid) {
      return res.status(400).json({ message: "Invalid MFA code" });
    }

    await user.update({ mfaEnabled: false, mfaSecret: null });

    res.json({ message: "MFA disabled successfully" });
  } catch (error) {
    console.error("Error disabling MFA:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getMfaStatus = async (req, res) => {
  try {
    const user = await User.scope("withPassword").findByPk(req.user.id);
    res.json({ mfaEnabled: user.mfaEnabled });
  } catch (error) {
    console.error("Error getting MFA status:", error);
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
    if (!req.body.cartId) {
      return res.status(400).json({
        message:
          "Es wurde kein Warenkorb übermittelt. Bitte wähle ein Fahrzeug aus und konfiguriere dein Abo erneut.",
        code: "CART_REQUIRED",
      });
    }

    const cartRow = await Cart.findByPk(req.body.cartId);
    if (!cartRow) {
      return res.status(400).json({
        message:
          "Der Warenkorb wurde nicht gefunden oder ist nicht mehr gültig. Bitte starte die Buchung erneut.",
        code: "CART_NOT_FOUND",
      });
    }

    const authData = await authentificateWithCantamen(email, password);
    const { userData, sepaMandate } = await collectUserDataFromCantamen(
      authData.id
    );

    // 1. Prüfen ob User existiert
    const emailHash = createHash(userData.emailAddress);
    let user = await User.scope("withPassword").findOne({
      where: { emailHash },
    });

    if (!user) {
      const hashedPassword = await bcrypt.hash(password, 10);

      user = await User.create({
        firstName: userData.prename,
        lastName: userData.name,
        email: userData.emailAddress,
        phone: userData.mobilePhoneNr,
        cantamenCustomerId: userData.customerNumber,
        emailHash: emailHash,
        passwordHash: hashedPassword,
        role: "CUSTOMER",
      });
    } else if (!user.cantamenCustomerId && userData.customerNumber) {
      //update customer
      await user.update({ cantamenCustomerId: userData.customerNumber });
    }

    await Cart.update(
      { userId: user.id, syncedByCantamen: true },
      { where: { id: req.body.cartId } },
    );

    // 4. Response zurückgeben
    res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        birthday: extractIsoDate(userData.birthDate),
        birthPlace: userData.birthPlace,
        street: userData.address?.street,
        housenumber: userData.address?.streetNr,
        postalCode: userData.address?.postalCode,
        city: userData.address?.city,
        country: userData.address?.country,
        driversLicenseNumber: userData.driverlicenseNumber,
        driversLicenseIssued: extractIsoDate(userData.driverlicenseIssued),
        driversLicenseIssuingPlace: userData.driverlicenseIssuedPlace,
        driversLicenseValidUntil: extractIsoDate(
          userData.driverlicenseValidUntil,
        ),
        driversLicenseClassesAllowed: userData.driverlicenseClassesAllowed,
        IdCardNumber: userData.identityNumber,
        hasCantamenSepa: sepaMandate,
      },
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: e.message || "Internal server error" });
  }
};
