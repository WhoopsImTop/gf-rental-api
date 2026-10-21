const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { Op } = require("sequelize");
const QRCode = require("qrcode");
const { generateSecret: generateTotpSecret, verifyCode: verifyTotpCode, generateURI: generateTotpURI } = require("../../services/auth/totpService");
const { createToken, createMfaToken, verifyToken } = require("../../services/auth/tokenService");
const {
  setAuthCookie,
  clearAuthCookie,
  SESSION_MAX_AGE_MS,
  getAuthTokenFromRequest,
  isAllowedBrowserLogout,
} = require("../../services/auth/authCookie");
const { User, Session, Cart } = require("../../models"); // Importiere das User-Modell
const { createHash, encrypt } = require("../../services/encryption");
const { sendOtpEmail, sendPasswordResetEmail } = require("../../services/mailService");
const {
  authentificateWithCantamen,
  collectUserDataFromCantamen,
} = require("../../services/auth/cantamen");
const { VerificationCode, PasswordResetCode } = require("../../models");
const { normalizeCartAccessToken } = require("../../utils/cartAccessToken");
const {
  isSixDigitCode,
  isNonEmptyString,
  isValidNewPassword,
} = require("../../utils/authInput");
const { isPrivilegedRole } = require("../../services/security/accessPolicy");

// Rollen, die ein Admin im CRM beim Anlegen vergeben kann (siehe gf_crm pages/users.vue).
const ASSIGNABLE_ROLES = ["ADMIN", "SELLER", "CUSTOMER"];

// Nach so vielen Fehlversuchen sind alle offenen Codes einer E-Mail ungueltig.
const MAX_CODE_ATTEMPTS = 5;

/**
 * Sucht einen gueltigen OTP-/Reset-Code (nicht abgelaufen, Versuche nicht aufgebraucht).
 * Ein falscher Code zaehlt als Fehlversuch fuer alle offenen Codes dieser E-Mail.
 */
async function findUsableCode(CodeModel, emailHash, code) {
  const match = await CodeModel.findOne({
    where: {
      emailHash,
      code,
      expiresAt: { [Op.gt]: new Date() },
      attempts: { [Op.lt]: MAX_CODE_ATTEMPTS },
    },
    order: [["createdAt", "DESC"]],
  });

  if (!match) {
    await CodeModel.increment("attempts", { where: { emailHash } });
  }
  return match;
}
const { logSecurityEvent } = require("../../services/audit/securityAudit");
const { scheduleForCart, attachUserToCartJobs } = require("../../services/followup/followupService");

function extractIsoDate(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}


exports.registerUser = async (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body;
  // Route ist nur fuer ADMIN erreichbar; ohne Angabe bleibt es wie bisher bei CUSTOMER.
  const role = req.body.role === undefined ? "CUSTOMER" : req.body.role;

  if (!ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }
  if (!isNonEmptyString(email)) {
    return res.status(400).json({ message: "E-Mail ist erforderlich." });
  }
  // Nur Mitarbeiter melden sich an und brauchen ein Passwort; Kunden bekommen keins.
  const needsPassword = isPrivilegedRole(role);
  if (needsPassword && !isValidNewPassword(password)) {
    return res
      .status(400)
      .json({ message: "Das Passwort muss mindestens 8 Zeichen lang sein." });
  }

  try {
    const emailHash = createHash(email);
    // Prüfe, ob der Benutzer bereits existiert
    const existingUser = await User.scope("withPassword").findOne({
      where: { emailHash },
    });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Diese E-Mail-Adresse ist bereits registriert." });
    }

    const passwordHash = needsPassword ? await bcrypt.hash(password, 10) : null;

    // Benutzer erstellen
    const newUser = await User.create({
      firstName,
      lastName,
      email,
      emailHash: emailHash,
      phone,
      passwordHash,
      role,
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
  const accessToken = normalizeCartAccessToken(req.body.accessToken);

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

    // Schedule follow-ups already on OTP request (even without name/user yet).
    // Do not attach userId before verification — only store email on the job.
    if (accessToken) {
      try {
        const cartRow = await Cart.findOne({ where: { accessToken } });
        if (cartRow && !cartRow.completed) {
          await scheduleForCart(cartRow.id, { email });
        }
      } catch (scheduleError) {
        console.error(
          "Follow-up scheduling failed after OTP request:",
          scheduleError,
        );
      }
    }

    res.json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error requesting OTP:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.verifyOtp = async (req, res) => {
  const emailRaw = req.body.email;
  const code = typeof req.body.code === "string" ? req.body.code.trim() : req.body.code;
  const invalidCodeResponse = {
    message: "Der Code ist ungültig oder abgelaufen. Bitte fordere einen neuen Code an.",
  };

  // Nur Strings zulassen: ein Array als `code` wuerde zu `IN (...)` und erlaubt Brute-Force.
  if (!isNonEmptyString(emailRaw) || !isSixDigitCode(code)) {
    return res.status(400).json(invalidCodeResponse);
  }

  try {
    const emailHash = createHash(emailRaw);
    const verification = await findUsableCode(VerificationCode, emailHash, code);
    if (!verification) {
      return res.status(400).json(invalidCodeResponse);
    }

    // Warenkorb pruefen, bevor der Code verbraucht oder ein User angelegt wird.
    const accessToken = normalizeCartAccessToken(req.body.accessToken);
    if (!accessToken) {
      return res.status(400).json({
        message:
          "Es wurde kein Warenkorb übermittelt. Bitte wähle ein Fahrzeug aus und konfiguriere dein Abo erneut.",
        code: "ACCESS_TOKEN_REQUIRED",
      });
    }

    const cartRow = await Cart.findOne({ where: { accessToken } });
    if (!cartRow) {
      logSecurityEvent({
        req,
        action: "verify_otp_cart",
        outcome: "cart_not_found",
        accessToken,
      });
      return res.status(400).json({
        message:
          "Der Warenkorb wurde nicht gefunden oder ist nicht mehr gültig. Bitte starte die Buchung erneut.",
        code: "CART_NOT_FOUND",
      });
    }

    if (cartRow.completed) {
      return res.status(400).json({
        message:
          "Dieser Warenkorb ist bereits abgeschlossen. Bitte starte eine neue Konfiguration.",
        code: "CART_COMPLETED",
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

    await Cart.update({ userId: user.id }, { where: { accessToken } });

    try {
      await attachUserToCartJobs(cartRow.id, user.id);
      await scheduleForCart(cartRow.id, { email: emailRaw });
    } catch (scheduleError) {
      console.error("Follow-up scheduling failed after OTP:", scheduleError);
    }

    logSecurityEvent({
      req,
      action: "verify_otp_cart",
      outcome: "ok",
      accessToken,
      extra: { userId: user.id },
    });

    // Keine Session/kein Token: Kunden melden sich nirgends an. Der Checkout
    // erkennt den bestaetigten Kunden ueber den Warenkorb (cart.userId).
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
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      logSecurityEvent({
        req,
        action: "login",
        outcome: "fail",
        extra: { reason: "missing_credentials" },
      });
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const emailHash = createHash(email);
    // Benutzer anhand der Email suchen
    const user = await User.scope("withPassword").findOne({
      where: { emailHash },
    });
    // Nur CRM-Mitarbeiter koennen sich anmelden; Kunden bekommen dieselbe
    // Meldung wie bei unbekannter E-Mail (keine Rueckschluesse moeglich).
    if (!user || !isPrivilegedRole(user.role)) {
      logSecurityEvent({
        req,
        action: "login",
        outcome: "fail",
        extra: {
          reason: user ? "role_not_allowed" : "unknown_user",
          ...(user ? { userId: user.id } : {}),
        },
      });
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Passwort prüfen
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      logSecurityEvent({
        req,
        action: "login",
        outcome: "fail",
        extra: { reason: "bad_password", userId: user.id },
      });
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Wenn MFA aktiviert ist, temporären Token zurückgeben
    if (user.mfaEnabled) {
      const mfaToken = createMfaToken({ userId: user.id });
      logSecurityEvent({
        req,
        action: "login",
        outcome: "ok",
        extra: { step: "mfa_required", userId: user.id },
      });
      return res.json({ mfaRequired: true, mfaToken });
    }

    // Bestehende Sessions des Benutzers löschen (optional)
    await Session.destroy({ where: { userId: user.id } });

    // JWT erstellen
    const token = createToken({ userId: user.id, role: user.role });

    // Session in der Datenbank speichern
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
    await Session.create({ userId: user.id, token, expiresAt });

    logSecurityEvent({
      req,
      action: "login",
      outcome: "ok",
      extra: { userId: user.id },
    });

    setAuthCookie(res, token);
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
    console.error("Error during login:", error);
    logSecurityEvent({
      req,
      action: "login",
      outcome: "fail",
      extra: { reason: "server_error" },
    });
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─── Password Reset ─────────────────────────────────────────────

exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  if (!isNonEmptyString(email)) {
    return res.json({ message: "If the email exists, a reset code has been sent" });
  }

  try {
    const emailHash = createHash(email);
    const user = await User.scope("withPassword").findOne({
      where: { emailHash },
    });

    // Always return success to prevent email enumeration.
    // Passwoerter gibt es nur fuer CRM-Mitarbeiter.
    if (!user || !isPrivilegedRole(user.role)) {
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
  const { email, newPassword } = req.body;
  const code = typeof req.body.code === "string" ? req.body.code.trim() : req.body.code;

  // Nur Strings zulassen: ein Array als `code` wuerde zu `IN (...)` und erlaubt Brute-Force.
  if (!isNonEmptyString(email) || !isSixDigitCode(code)) {
    return res.status(400).json({ message: "Invalid or expired reset code" });
  }
  if (!isValidNewPassword(newPassword)) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }

  try {
    const emailHash = createHash(email);

    const resetCode = await findUsableCode(PasswordResetCode, emailHash, code);
    if (!resetCode) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    const user = await User.scope("withPassword").findOne({
      where: { emailHash },
    });

    if (!user || !isPrivilegedRole(user.role)) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ passwordHash: hashedPassword });

    // Clean up used code
    await resetCode.destroy();

    await Session.destroy({ where: { userId: user.id } });

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
      logSecurityEvent({
        req,
        action: "verify_mfa_login",
        outcome: "fail",
        extra: { reason: "invalid_mfa_token" },
      });
      return res.status(400).json({ message: "Invalid or expired MFA token" });
    }

    const user = await User.scope("withPassword").findByPk(decoded.userId);
    if (!user || !isPrivilegedRole(user.role) || !user.mfaEnabled || !user.mfaSecret) {
      logSecurityEvent({
        req,
        action: "verify_mfa_login",
        outcome: "fail",
        extra: { reason: "mfa_not_configured", userId: decoded.userId },
      });
      return res.status(400).json({ message: "MFA not configured" });
    }

    const isValid = verifyTotpCode(code, user.mfaSecret);

    if (!isValid) {
      logSecurityEvent({
        req,
        action: "verify_mfa_login",
        outcome: "fail",
        extra: { reason: "bad_mfa_code", userId: user.id },
      });
      return res.status(400).json({ message: "Invalid MFA code" });
    }

    // MFA verified — create full session
    await Session.destroy({ where: { userId: user.id } });
    const token = createToken({ userId: user.id, role: user.role });
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
    await Session.create({ userId: user.id, token, expiresAt });

    logSecurityEvent({
      req,
      action: "verify_mfa_login",
      outcome: "ok",
      extra: { userId: user.id },
    });

    setAuthCookie(res, token);
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
    console.error("Error verifying MFA login:", error);
    logSecurityEvent({
      req,
      action: "verify_mfa_login",
      outcome: "fail",
      extra: { reason: "server_error" },
    });
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

    await Session.destroy({ where: { userId: user.id } });
    clearAuthCookie(res);

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
    const accessToken = normalizeCartAccessToken(req.body.accessToken);
    if (!accessToken) {
      return res.status(400).json({
        message:
          "Es wurde kein Warenkorb übermittelt. Bitte wähle ein Fahrzeug aus und konfiguriere dein Abo erneut.",
        code: "ACCESS_TOKEN_REQUIRED",
      });
    }

    const cartRow = await Cart.findOne({ where: { accessToken } });
    if (!cartRow) {
      logSecurityEvent({
        req,
        action: "cantamen_auth_cart",
        outcome: "cart_not_found",
        accessToken,
      });
      return res.status(400).json({
        message:
          "Der Warenkorb wurde nicht gefunden oder ist nicht mehr gültig. Bitte starte die Buchung erneut.",
        code: "CART_NOT_FOUND",
      });
    }

    if (cartRow.completed) {
      return res.status(400).json({
        message:
          "Dieser Warenkorb ist bereits abgeschlossen. Bitte starte eine neue Konfiguration.",
        code: "CART_COMPLETED",
      });
    }

    const authData = await authentificateWithCantamen(email, password);
    const { userData, sepaMandate, sepaMandateReference, sepaAccount } =
      await collectUserDataFromCantamen(
      authData.id
    );

    const isCompanyCustomer = userData.gender === "COMPANY";
    const phone = isCompanyCustomer
      ? userData.phoneNr || userData.mobilePhoneNr
      : userData.mobilePhoneNr || userData.phoneNr;

    // 1. Prüfen ob User existiert
    const emailHash = createHash(userData.emailAddress);
    let user = await User.scope("withPassword").findOne({
      where: { emailHash },
    });

    if (!user) {
      // Kein passwordHash: Kunden melden sich nicht an, das Cantamen-Passwort
      // wird nur fuer die Anmeldung bei Cantamen verwendet und nicht gespeichert.
      user = await User.create({
        firstName: userData.prename,
        lastName: userData.name,
        email: userData.emailAddress,
        phone,
        cantamenCustomerId: userData.customerNumber,
        emailHash: emailHash,
        role: "CUSTOMER",
      });
    } else {
      const userUpdates = {};
      if (!user.cantamenCustomerId && userData.customerNumber) {
        userUpdates.cantamenCustomerId = userData.customerNumber;
      }
      if (phone && user.phone !== phone) {
        userUpdates.phone = phone;
      }
      if (Object.keys(userUpdates).length > 0) {
        await user.update(userUpdates);
      }
    }

    await Cart.update(
      {
        userId: user.id,
        syncedByCantamen: true,
        ...(isCompanyCustomer ? { customerType: "business" } : {}),
      },
      { where: { accessToken } },
    );

    try {
      await scheduleForCart(cartRow.id);
    } catch (scheduleError) {
      console.error("Follow-up scheduling failed after Cantamen auth:", scheduleError);
    }

    logSecurityEvent({
      req,
      action: "cantamen_auth_cart",
      outcome: "ok",
      accessToken,
      extra: { userId: user.id },
    });

    // 4. Response zurückgeben (ohne Session/Token, Kunden melden sich nirgends an)
    res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        gender: userData.gender,
        customerType: isCompanyCustomer ? "business" : "private",
        companyName: isCompanyCustomer ? userData.prename : null,
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
        iban: sepaAccount?.iban || null,
        accountHolderName: sepaAccount?.accountHolder || null,
        sepaMandateReference: sepaMandateReference || null,
      },
    });
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "firstName", "lastName", "role"],
    });
    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({ message: "Unauthorized" });
    }
    return res.json({ user });
  } catch (error) {
    console.error("Error getting current user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.logoutUser = async (req, res) => {
  try {
    if (!isAllowedBrowserLogout(req)) {
      // Do not clear a victim's cookie on rejected cross-site CSRF attempts.
      return res.status(403).json({ message: "Forbidden" });
    }

    // Best-effort: works without prior authenticateToken so forceLogout
    // can always clear the httpOnly cookie even when the session is already gone.
    const token = getAuthTokenFromRequest(req);
    if (token) {
      await Session.destroy({ where: { token } });
    }
    clearAuthCookie(res);
    return res.json({ message: "Logged out" });
  } catch (error) {
    console.error("Error during logout:", error);
    clearAuthCookie(res);
    return res.status(500).json({ message: "Internal server error" });
  }
};
