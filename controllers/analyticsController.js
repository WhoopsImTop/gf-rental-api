const requestIp = require('request-ip');
const geoip = require('geoip-lite');
const { PageVisit } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('sequelize');

const buildCartStats = async (sinceDate) => {
  const db = require('../models');
  const dbSequelize = db.sequelize;

  const replacements = { since: sinceDate };

  const summarySql = `
    SELECT
      COUNT(*) AS totalStarted,
      SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS totalCompleted,
      AVG(CASE WHEN depositValue IS NOT NULL THEN depositValue ELSE NULL END) AS avgDepositValueStarted,
      SUM(CASE WHEN depositValue IS NOT NULL THEN 1 ELSE 0 END) AS depositProvidedCountStarted,
      AVG(CASE WHEN completed = 1 AND depositValue IS NOT NULL THEN depositValue ELSE NULL END) AS avgDepositValueCompleted,
      SUM(CASE WHEN completed = 1 AND depositValue IS NOT NULL THEN 1 ELSE 0 END) AS depositProvidedCountCompleted
    FROM Carts
    WHERE createdAt >= :since
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
    WHERE c.createdAt >= :since
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
    WHERE c.createdAt >= :since
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
    timeframeDays: 30,
    totalStartedCarts: totalStarted,
    totalCompletedCarts: totalCompleted,
    completionRate,
    avgDepositValueStarted,
    depositProvidedCountStarted,
    avgDepositValueCompleted,
    depositProvidedCountCompleted,
    topVehicles,
    topMileageDuration,
  };
};

exports.trackVisit = async (req, res) => {
  try {
    const { session_id, page_url, duration_seconds, referrer, campaign } = req.body;

    if (!session_id || !page_url || duration_seconds === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get IP address
    const clientIp = requestIp.getClientIp(req) || req.ip || '127.0.0.1';

    // Determine country
    const geo = geoip.lookup(clientIp);
    const country = geo ? geo.country : 'Unknown';

    // Save to database
    await PageVisit.create({
      session_id,
      ip_address: clientIp,
      country,
      referrer,
      campaign,
      page_url,
      duration_seconds,
      visited_at: new Date()
    });

    res.status(200).json({ message: 'Visit tracked successfully' });
  } catch (error) {
    console.error('Error tracking visit:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // 1. Visitors (unique session_ids)
    const totalVisitorsCount = await PageVisit.count({
      distinct: true,
      col: 'session_id'
    });

    // 2. Orders (Contracts in last 30 days)
    const { Contract } = require('../models');
    const totalOrders = await Contract.count({
      where: {
        createdAt: {
          [Op.gte]: thirtyDaysAgo
        }
      }
    });

    // 3. Revenue (Sum of monthlyPrice for those Contracts)
    const totalRevenueRow = await Contract.findOne({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('monthlyPrice')), 'total_revenue']
      ],
      where: {
        createdAt: {
          [Op.gte]: thirtyDaysAgo
        }
      }
    });
    const totalRevenue = totalRevenueRow ? parseFloat(totalRevenueRow.get('total_revenue') || 0) : 0;

    // 4. Conversion Rate
    const conversionRate = totalVisitorsCount > 0 ? ((totalOrders / totalVisitorsCount) * 100).toFixed(2) : 0;

    // 5. Revenue / Visitor
    const revenuePerVisitor = totalVisitorsCount > 0 ? (totalRevenue / totalVisitorsCount).toFixed(2) : 0;

    // 6. Bounce rate & Avg Session Time
    const totalHits = await PageVisit.count();
    const bounces = await PageVisit.count({
      where: {
        duration_seconds: {
          [Op.lt]: 5
        }
      }
    });
    const bounceRate = totalHits > 0 ? ((bounces / totalHits) * 100).toFixed(1) : 0;

    const avgDurationRow = await PageVisit.findOne({
      attributes: [
        [sequelize.fn('AVG', sequelize.col('duration_seconds')), 'average_duration']
      ]
    });
    const averageDuration = avgDurationRow ? parseFloat(avgDurationRow.get('average_duration') || 0).toFixed(0) : 0;

    // 7. Online (Visits in last 5 min)
    const currentOnline = await PageVisit.count({
      where: {
        visited_at: {
          [Op.gte]: fiveMinutesAgo
        }
      },
      distinct: true,
      col: 'session_id'
    });

    // 8. Chart Data (Grouped by date for last 30 days)
    const visitorsOverTime = await PageVisit.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('visited_at')), 'date'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('session_id'))), 'count']
      ],
      where: {
        visited_at: {
          [Op.gte]: thirtyDaysAgo
        }
      },
      group: [sequelize.fn('DATE', sequelize.col('visited_at'))],
      order: [[sequelize.literal('date'), 'ASC']]
    });

    const ordersOverTime = await Contract.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        createdAt: {
          [Op.gte]: thirtyDaysAgo
        }
      },
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.literal('date'), 'ASC']]
    });

    // 9. Tables: Referrers, Campaigns, Countries
    const referrers = await PageVisit.findAll({
      attributes: [
        [sequelize.literal('IFNULL(referrer, "Direct/None")'), 'name'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('session_id'))), 'count']
      ],
      group: ['name'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit: 10
    });

    const campaigns = await PageVisit.findAll({
      attributes: [
        [sequelize.literal('IFNULL(campaign, "Organic/None")'), 'name'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('session_id'))), 'count']
      ],
      group: ['name'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit: 10
    });

    const countries = await PageVisit.findAll({
      attributes: [
        [sequelize.col('country'), 'name'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('session_id'))), 'count']
      ],
      group: ['country'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit: 10
    });

    const cartStats = await buildCartStats(thirtyDaysAgo);

    res.status(200).json({
      totalVisitors: totalVisitorsCount,
      totalOrders,
      totalRevenue,
      conversionRate,
      revenuePerVisitor,
      bounceRate,
      averageDuration,
      currentOnline,
      chart: {
        visitors: visitorsOverTime,
        orders: ordersOverTime
      },
      referrers,
      campaigns,
      countries,
      cartStats,
    });
  } catch (error) {
    console.error('Error getting analytics stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
