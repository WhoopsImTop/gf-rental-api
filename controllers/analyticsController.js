const requestIp = require('request-ip');
const geoip = require('geoip-lite');
const { PageVisit } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('sequelize');

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
      countries
    });
  } catch (error) {
    console.error('Error getting analytics stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
