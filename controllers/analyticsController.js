const requestIp = require('request-ip');
const geoip = require('geoip-lite');
const { PageVisit, Cart, CartCheckoutEvent, CartClientError } = require('../models');
const { Op } = require('sequelize');
const {
  CLICK_SOURCES,
  DEFAULT_OWN_DOMAINS,
  classifyTraffic,
  sanitizeReferrerHost,
} = require('../services/analytics/trafficSource');
const { isBot, parseUserAgent } = require('../services/analytics/userAgent');
const { computeVisitorId } = require('../services/analytics/visitorId');
const { sanitizePath, sanitizeHostname, sanitizeUtm } = require('../services/analytics/pagePath');
const { resolveRange, toSqlUtc } = require('../services/analytics/timeRange');
const { buildDashboardStats } = require('../services/analytics/dashboardStats');

const OWN_DOMAINS = String(process.env.ANALYTICS_OWN_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
const ownDomains = OWN_DOMAINS.length ? OWN_DOMAINS : DEFAULT_OWN_DOMAINS;

const ALLOWED_EVENT_TYPES = new Set([
  'step_viewed',
  'step_completed',
  'checkout_submitted',
  'checkout_completed',
]);

const ALLOWED_STEP_NAMES = new Set([
  'login',
  'contact',
  'confirmation',
  'payment',
  'summary',
]);

const ALLOWED_ERROR_SOURCES = new Set([
  'vue',
  'window',
  'unhandledrejection',
  'manual',
  'fetch',
]);

const FUNNEL_STEPS = [
  { stepName: 'login', label: 'Anmeldung' },
  { stepName: 'contact', label: 'Kontaktdaten' },
  { stepName: 'confirmation', label: 'Bestätigung' },
  { stepName: 'payment', label: 'Zahlung' },
  { stepName: 'summary', label: 'Übersicht' },
  { stepName: 'completed', label: 'Abgeschlossen' },
];

const truncate = (value, max) => {
  if (value == null) return null;
  const str = String(value);
  return str.length > max ? str.slice(0, max) : str;
};

const isValidSessionId = (sessionId) =>
  typeof sessionId === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(sessionId);

const isValidAccessToken = (token) =>
  typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token);

const IGNORED_ERROR_PATTERNS = [
  /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i,
  /r\["@context"\]\.toLowerCase/i,
  /^\{\s*"isTrusted"\s*:\s*true\s*\}$/,
  /^Script error\.?$/i,
  /^Seite nicht gefunden/i,
];

const isIgnoredBrowserNoise = (message) =>
  IGNORED_ERROR_PATTERNS.some((pattern) => pattern.test(String(message || '')));

const resolveCartByAccessToken = async (accessToken) => {
  if (!isValidAccessToken(accessToken)) return null;
  return Cart.findOne({ where: { accessToken } });
};

const buildCheckoutFunnelStats = async (sinceDate, untilDate) => {
  const db = require('../models');
  const dbSequelize = db.sequelize;
  const replacements = { since: sinceDate, until: untilDate };

  const funnelSql = `
    SELECT
      CASE
        WHEN eventType = 'checkout_completed' THEN 'completed'
        ELSE stepName
      END AS stepKey,
      COUNT(DISTINCT cartId) AS cartCount
    FROM CartCheckoutEvents
    WHERE createdAt >= :since
      AND createdAt < :until
      AND cartId IS NOT NULL
      AND (
        eventType IN ('step_viewed', 'checkout_completed')
        OR (eventType = 'checkout_submitted' AND stepName = 'summary')
      )
      AND (
        eventType = 'checkout_completed'
        OR stepName IN ('login', 'contact', 'confirmation', 'payment', 'summary')
      )
    GROUP BY stepKey
  `;

  const [rows] = await dbSequelize.query(funnelSql, { replacements });
  const countByStep = {};
  for (const row of rows || []) {
    countByStep[row.stepKey] = Number(row.cartCount) || 0;
  }

  const steps = FUNNEL_STEPS.map((step, index) => {
    const count = countByStep[step.stepName] || 0;
    const prevCount =
      index === 0 ? count : countByStep[FUNNEL_STEPS[index - 1].stepName] || 0;
    const dropOffRate =
      index === 0 || prevCount === 0
        ? 0
        : Math.max(0, ((prevCount - count) / prevCount) * 100);
    return {
      stepName: step.stepName,
      label: step.label,
      cartCount: count,
      dropOffRate,
    };
  });

  return { steps };
};

const buildClientErrorStats = async (sinceDate, untilDate) => {
  const db = require('../models');
  const dbSequelize = db.sequelize;

  const [countRows] = await dbSequelize.query(
    `
      SELECT COUNT(DISTINCT cartId) AS cartsWithErrors
      FROM CartClientErrors
      WHERE createdAt >= :since
        AND createdAt < :until
        AND cartId IS NOT NULL
    `,
    { replacements: { since: sinceDate, until: untilDate } },
  );
  const cartsWithErrors = Number(countRows?.[0]?.cartsWithErrors) || 0;

  const recentErrorsSql = `
    SELECT
      c.id AS cartId,
      c.lastCheckoutStep AS lastCheckoutStep,
      c.clientErrorCount AS clientErrorCount,
      e.message AS lastErrorMessage,
      e.createdAt AS lastErrorAt
    FROM Carts c
    INNER JOIN (
      SELECT cartId, MAX(id) AS maxId
      FROM CartClientErrors
      WHERE cartId IS NOT NULL AND createdAt >= :since AND createdAt < :until
      GROUP BY cartId
    ) latest ON latest.cartId = c.id
    INNER JOIN CartClientErrors e ON e.id = latest.maxId
    WHERE c.clientErrorCount > 0
    ORDER BY e.createdAt DESC
    LIMIT 15
  `;

  const [recentRows] = await dbSequelize.query(recentErrorsSql, {
    replacements: { since: sinceDate, until: untilDate },
  });

  const recentCartsWithErrors = (recentRows || []).map((row) => ({
    cartId: row.cartId,
    lastCheckoutStep: row.lastCheckoutStep || null,
    clientErrorCount: Number(row.clientErrorCount) || 0,
    lastErrorMessage: truncate(row.lastErrorMessage, 200),
    lastErrorAt: row.lastErrorAt,
  }));

  return {
    cartsWithErrors,
    recentCartsWithErrors,
  };
};

const buildCartStats = async (sinceDate, untilDate, timeframeLabel) => {
  const db = require('../models');
  const dbSequelize = db.sequelize;

  const replacements = { since: sinceDate, until: untilDate };

  const summarySql = `
    SELECT
      COUNT(*) AS totalStarted,
      SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS totalCompleted,
      AVG(CASE WHEN depositValue IS NOT NULL THEN depositValue ELSE NULL END) AS avgDepositValueStarted,
      SUM(CASE WHEN depositValue IS NOT NULL THEN 1 ELSE 0 END) AS depositProvidedCountStarted,
      AVG(CASE WHEN completed = 1 AND depositValue IS NOT NULL THEN depositValue ELSE NULL END) AS avgDepositValueCompleted,
      SUM(CASE WHEN completed = 1 AND depositValue IS NOT NULL THEN 1 ELSE 0 END) AS depositProvidedCountCompleted
    FROM Carts
    WHERE createdAt >= :since AND createdAt < :until
  `;

  const topVehiclesSql = `
    SELECT
      c.carAboId AS carAboId,
      COALESCE(car.displayName, CAST(c.carAboId AS CHAR)) AS vehicleDisplayName,
      COUNT(*) AS startedCount,
      SUM(CASE WHEN c.completed = 1 THEN 1 ELSE 0 END) AS completedCount,
      AVG(CASE WHEN c.depositValue IS NOT NULL THEN c.depositValue ELSE NULL END) AS avgDepositValueStarted,
      AVG(CASE WHEN c.completed = 1 AND c.depositValue IS NOT NULL THEN c.depositValue ELSE NULL END) AS avgDepositValueCompleted
    FROM Carts c
    LEFT JOIN CarAbos car ON car.id = c.carAboId
    WHERE c.createdAt >= :since AND c.createdAt < :until
    GROUP BY c.carAboId, car.displayName
    ORDER BY startedCount DESC
    LIMIT 10
  `;

  const topMileageDurationSql = `
    SELECT
      p.durationMonths AS durationMonths,
      p.mileageKm AS mileageKm,
      COUNT(*) AS startedCount,
      SUM(CASE WHEN c.completed = 1 THEN 1 ELSE 0 END) AS completedCount,
      AVG(CASE WHEN c.depositValue IS NOT NULL THEN c.depositValue ELSE NULL END) AS avgDepositValueStarted
    FROM Carts c
    INNER JOIN CarAboPrices p ON p.id = c.priceId
    WHERE c.createdAt >= :since AND c.createdAt < :until
    GROUP BY p.durationMonths, p.mileageKm
    ORDER BY startedCount DESC
    LIMIT 10
  `;

  const [summaryRows] = await dbSequelize.query(summarySql, { replacements });
  const summary = summaryRows?.[0] || {};

  const toNum = (v) => {
    if (v === null || v === undefined) return null;
    const n = typeof v === 'string' ? Number(v) : v;
    return Number.isNaN(n) ? null : n;
  };

  const parseAvg = (v) => {
    if (v === null || v === undefined) return null;
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return Number.isNaN(n) ? null : n;
  };

  const totalStarted = toNum(summary.totalStarted) || 0;
  const totalCompleted = toNum(summary.totalCompleted) || 0;
  const completionRate = totalStarted > 0 ? (totalCompleted / totalStarted) * 100 : 0;

  const avgDepositValueStarted = parseAvg(summary.avgDepositValueStarted);
  const depositProvidedCountStarted = toNum(summary.depositProvidedCountStarted) || 0;
  const avgDepositValueCompleted = parseAvg(summary.avgDepositValueCompleted);
  const depositProvidedCountCompleted = toNum(summary.depositProvidedCountCompleted) || 0;

  const [vehicleRows] = await dbSequelize.query(topVehiclesSql, { replacements });
  const [comboRows] = await dbSequelize.query(topMileageDurationSql, { replacements });

  const topVehicles = (vehicleRows || []).map((r) => {
    const startedCount = toNum(r.startedCount) || 0;
    const completedCount = toNum(r.completedCount) || 0;
    return {
      carAboId: r.carAboId,
      vehicleDisplayName: r.vehicleDisplayName,
      startedCount,
      completedCount,
      completionRate: startedCount > 0 ? (completedCount / startedCount) * 100 : 0,
      avgDepositValueStarted: parseAvg(r.avgDepositValueStarted),
      avgDepositValueCompleted: parseAvg(r.avgDepositValueCompleted),
    };
  });

  const topMileageDuration = (comboRows || []).map((r) => {
    const startedCount = toNum(r.startedCount) || 0;
    const completedCount = toNum(r.completedCount) || 0;
    return {
      durationMonths: toNum(r.durationMonths),
      mileageKm: toNum(r.mileageKm),
      startedCount,
      completedCount,
      completionRate: startedCount > 0 ? (completedCount / startedCount) * 100 : 0,
      avgDepositValueStarted: parseAvg(r.avgDepositValueStarted),
    };
  });

  return {
    timeframeLabel,
    totalStartedCarts: totalStarted,
    totalCompletedCarts: totalCompleted,
    completionRate,
    avgDepositValueStarted,
    depositProvidedCountStarted,
    avgDepositValueCompleted,
    depositProvidedCountCompleted,
    topVehicles,
    topMileageDuration,
    checkoutFunnel: await buildCheckoutFunnelStats(sinceDate, untilDate),
    clientErrors: await buildClientErrorStats(sinceDate, untilDate),
  };
};

const PAGEVIEW_ID_PATTERN = /^[a-f0-9]{32}$/;

const parseTrackBody = (body) => {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body && typeof body === 'object' ? body : null;
};

const getClientContext = (req) => {
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 512);
  const clientIp = requestIp.getClientIp(req) || req.ip || '';
  return { userAgent, clientIp };
};

/**
 * Erste Quelle des Besuchers am heutigen Tag. Ein späterer externer Besuch
 * ersetzt eine "Direkt"-Zuordnung (erste nicht-direkte Quelle gewinnt).
 */
const resolveSessionAttribution = async (visitorId, attribution, utm) => {
  const firstVisit = await PageVisit.findOne({
    where: { session_id: visitorId },
    order: [['id', 'ASC']],
    attributes: ['source', 'channel', 'campaign', 'utm_source', 'utm_medium'],
  });

  if (!firstVisit || !firstVisit.source) return { ...attribution, ...utm };

  if (firstVisit.channel === 'Direkt' && attribution.channel !== 'Direkt') {
    await PageVisit.update(
      { ...attribution, ...utm },
      { where: { session_id: visitorId } },
    );
    return { ...attribution, ...utm };
  }

  return {
    source: firstVisit.source,
    channel: firstVisit.channel,
    campaign: firstVisit.campaign,
    utm_source: firstVisit.utm_source,
    utm_medium: firstVisit.utm_medium,
  };
};

const trackEngagement = async (body) => {
  const pageviewId = body.pageview_id;
  const dur = Math.round(Number(body.duration_seconds));
  if (typeof pageviewId !== 'string' || !PAGEVIEW_ID_PATTERN.test(pageviewId)) {
    return { status: 400, error: 'Invalid pageview_id' };
  }
  if (!Number.isFinite(dur) || dur < 0 || dur > 86400) {
    return { status: 400, error: 'Invalid duration_seconds' };
  }

  await PageVisit.update(
    { duration_seconds: dur },
    {
      where: {
        pageview_id: pageviewId,
        visited_at: { [Op.gte]: new Date(Date.now() - 86400000) },
        [Op.or]: [
          { duration_seconds: null },
          { duration_seconds: { [Op.lt]: dur } },
        ],
      },
    },
  );
  return { status: 202 };
};

const trackPageview = async (req, body) => {
  const { userAgent, clientIp } = getClientContext(req);

  // Altes Format (gecachte Clients): eine Zeile pro verlassener Seite.
  const isLegacy = body.type == null && body.page_url != null;

  const path = sanitizePath(isLegacy ? body.page_url : body.path);
  if (!path) return { status: 400, error: 'Invalid path' };

  let pageviewId = null;
  if (!isLegacy) {
    if (typeof body.pageview_id !== 'string' || !PAGEVIEW_ID_PATTERN.test(body.pageview_id)) {
      return { status: 400, error: 'Invalid pageview_id' };
    }
    pageviewId = body.pageview_id;
  }

  let duration = 0;
  if (isLegacy) {
    duration = Math.round(Number(body.duration_seconds));
    if (!Number.isFinite(duration) || duration < 0 || duration > 86400) {
      return { status: 400, error: 'Invalid duration_seconds' };
    }
  }

  const clickSource =
    typeof body.click_source === 'string' && CLICK_SOURCES[body.click_source]
      ? body.click_source
      : null;
  const utm = {
    utm_source: sanitizeUtm(body.utm_source),
    utm_medium: sanitizeUtm(body.utm_medium),
    campaign: sanitizeUtm(isLegacy ? body.campaign : body.utm_campaign, 255),
  };

  const attribution = classifyTraffic({
    referrerHost: sanitizeReferrerHost(body.referrer),
    utmSource: utm.utm_source || (isLegacy ? utm.campaign : null),
    utmMedium: utm.utm_medium,
    clickSource,
    userAgent,
    ownDomains,
  });

  const visitorId = await computeVisitorId(clientIp, userAgent);
  const sessionAttribution = await resolveSessionAttribution(visitorId, attribution, utm);

  const geo = clientIp ? geoip.lookup(clientIp) : null;
  const { device, browser, os } = parseUserAgent(userAgent);

  await PageVisit.create({
    session_id: visitorId,
    pageview_id: pageviewId,
    ip_address: null,
    country: geo?.country || 'Unknown',
    city: geo?.city ? truncate(geo.city, 128) : null,
    hostname: sanitizeHostname(body.hostname),
    referrer: attribution.channel === 'Direkt' ? null : sanitizeReferrerHost(body.referrer),
    source: sessionAttribution.source,
    channel: sessionAttribution.channel,
    utm_source: sessionAttribution.utm_source || null,
    utm_medium: sessionAttribution.utm_medium || null,
    campaign: sessionAttribution.campaign || null,
    device,
    browser,
    os,
    page_url: path,
    duration_seconds: duration,
    visited_at: new Date(),
  });

  return { status: 202 };
};

exports.trackVisit = async (req, res) => {
  try {
    const body = parseTrackBody(req.body);
    if (!body) return res.status(400).json({ error: 'Invalid payload' });

    // Bots, Crawler und Link-Vorschauen nicht zählen.
    if (isBot(req.headers['user-agent'])) return res.status(202).end();

    const result =
      body.type === 'engagement'
        ? await trackEngagement(body)
        : await trackPageview(req, body);

    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(result.status).end();
  } catch (error) {
    console.error('Error tracking visit:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** Ordnet einen Warenkorb der Traffic-Quelle des heutigen Besuchs zu. */
const resolveCartAttribution = async (req) => {
  try {
    const { userAgent, clientIp } = getClientContext(req);
    if (isBot(userAgent)) return null;
    const visitorId = await computeVisitorId(clientIp, userAgent);
    const firstVisit = await PageVisit.findOne({
      where: { session_id: visitorId },
      order: [['id', 'ASC']],
      attributes: ['source', 'channel'],
    });
    if (!firstVisit?.source) return null;
    return { trafficSource: firstVisit.source, trafficChannel: firstVisit.channel };
  } catch (error) {
    console.error('Error resolving cart attribution:', error);
    return null;
  }
};

exports.trackCheckoutEvent = async (req, res) => {
  try {
    const {
      accessToken,
      sessionId,
      eventType,
      stepId,
      stepName,
      pageUrl,
    } = req.body || {};

    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ error: 'Invalid eventType' });
    }

    if (sessionId != null && !isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }

    if (
      stepName != null &&
      stepName !== '' &&
      !ALLOWED_STEP_NAMES.has(stepName)
    ) {
      return res.status(400).json({ error: 'Invalid stepName' });
    }

    if (pageUrl != null && (typeof pageUrl !== 'string' || pageUrl.length > 2048)) {
      return res.status(400).json({ error: 'Invalid pageUrl' });
    }

    let parsedStepId = null;
    if (stepId != null && stepId !== '') {
      parsedStepId = Number(stepId);
      if (!Number.isInteger(parsedStepId) || parsedStepId < 1 || parsedStepId > 10) {
        return res.status(400).json({ error: 'Invalid stepId' });
      }
    }

    const cart = await resolveCartByAccessToken(accessToken);
    const resolvedToken = cart?.accessToken || (isValidAccessToken(accessToken) ? accessToken : null);

    await CartCheckoutEvent.create({
      cartId: cart?.id || null,
      accessToken: resolvedToken,
      sessionId: sessionId || null,
      eventType,
      stepId: parsedStepId,
      stepName: stepName || null,
      pageUrl: truncate(pageUrl, 2048),
    });

    if (cart) {
      const updates = {};
      if (
        (eventType === 'step_viewed' || eventType === 'step_completed') &&
        stepName
      ) {
        updates.lastCheckoutStep = stepName;
      }
      if (eventType === 'checkout_submitted') {
        updates.lastCheckoutStep = 'summary';
      }
      if (eventType === 'checkout_completed') {
        updates.lastCheckoutStep = 'completed';
      }
      if (!cart.trafficSource) {
        Object.assign(updates, (await resolveCartAttribution(req)) || {});
      }
      if (Object.keys(updates).length > 0) {
        await cart.update(updates);
      }
    }

    res.status(200).json({ message: 'Checkout event tracked' });
  } catch (error) {
    console.error('Error tracking checkout event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.trackClientError = async (req, res) => {
  try {
    const {
      accessToken,
      sessionId,
      message,
      stack,
      source,
      pageUrl,
      stepName,
      userAgent,
    } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing message' });
    }

    if (isIgnoredBrowserNoise(message)) {
      return res.status(200).json({ message: 'Client error ignored' });
    }

    if (sessionId != null && !isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }

    const errorSource = ALLOWED_ERROR_SOURCES.has(source) ? source : 'window';

    if (
      stepName != null &&
      stepName !== '' &&
      !ALLOWED_STEP_NAMES.has(stepName)
    ) {
      return res.status(400).json({ error: 'Invalid stepName' });
    }

    if (pageUrl != null && (typeof pageUrl !== 'string' || pageUrl.length > 2048)) {
      return res.status(400).json({ error: 'Invalid pageUrl' });
    }

    const cart = await resolveCartByAccessToken(accessToken);
    const resolvedToken = cart?.accessToken || (isValidAccessToken(accessToken) ? accessToken : null);

    await CartClientError.create({
      cartId: cart?.id || null,
      accessToken: resolvedToken,
      sessionId: sessionId || null,
      message: truncate(message, 1024),
      stack: truncate(stack, 8000),
      source: errorSource,
      pageUrl: truncate(pageUrl, 2048),
      stepName: stepName || null,
      userAgent: truncate(userAgent, 512),
    });

    if (cart) {
      await cart.increment('clientErrorCount');
    }

    res.status(200).json({ message: 'Client error tracked' });
  } catch (error) {
    console.error('Error tracking client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const parseFilterValue = (value) =>
  typeof value === 'string' && value.trim() && value.length <= 64 ? value.trim() : null;

exports.getStats = async (req, res) => {
  try {
    const range = resolveRange(req.query.range);
    const filter = {
      source: parseFilterValue(req.query.source),
      channel: parseFilterValue(req.query.channel),
    };

    const [dashboard, cartStats] = await Promise.all([
      buildDashboardStats(range, filter),
      buildCartStats(toSqlUtc(range.from), toSqlUtc(range.to), range.label),
    ]);

    res.status(200).json({ ...dashboard, cartStats });
  } catch (error) {
    console.error('Error getting analytics stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
