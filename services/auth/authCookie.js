const AUTH_COOKIE_NAME = "gf_crm_session";
const isProduction = process.env.NODE_ENV === "production";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Re-issue JWT only via GET /auth/me when less than this much lifetime remains. */
const JWT_REFRESH_THRESHOLD_MS = 60 * 60 * 1000;

const authCookieConfig = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "strict",
  path: "/",
  maxAge: SESSION_MAX_AGE_MS,
};

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, authCookieConfig);
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, { ...authCookieConfig, maxAge: undefined });
}

function getCookieValue(cookieHeader, key) {
  if (!cookieHeader || typeof cookieHeader !== "string") return null;
  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");
    if (rawName === key) {
      return decodeURIComponent(rawValueParts.join("="));
    }
  }
  return null;
}

function getAuthTokenFromRequest(req) {
  const bearerToken = req.headers.authorization?.split(" ")[1];
  const cookieToken = getCookieValue(req.headers.cookie, AUTH_COOKIE_NAME);
  return bearerToken || cookieToken || null;
}

/**
 * Logout is intentionally unauthenticated (forceLogout must clear cookies).
 * Block obvious cross-site CSRF while allowing CRM subdomains + local dev.
 */
function isAllowedBrowserLogout(req) {
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") {
    return false;
  }

  const origin = req.headers.origin;
  if (!origin) {
    // Non-browser clients (curl) or rare same-origin cases without Origin.
    return true;
  }

  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "gruene-flotte.com" || host.endsWith(".gruene-flotte.com")) {
      return true;
    }
    if (!isProduction && (host === "localhost" || host === "127.0.0.1")) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

module.exports = {
  AUTH_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  JWT_REFRESH_THRESHOLD_MS,
  authCookieConfig,
  setAuthCookie,
  clearAuthCookie,
  getCookieValue,
  getAuthTokenFromRequest,
  isAllowedBrowserLogout,
};
