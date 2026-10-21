"use strict";

const { QueryTypes } = require("sequelize");
const { bucketSql, bucketKeys, toSqlUtc } = require("./timeRange");

const DIRECT_NAME = "Direkt";

const BREAKDOWN_COLUMNS = {
  campaigns: "campaign",
  pages: "page_url",
  hostnames: "hostname",
  countries: "country",
  cities: "city",
  devices: "device",
  browsers: "browser",
  os: "os",
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function createQuery() {
  const { sequelize } = require("../../models");
  return (sql, replacements) => {
    const normalized = {};
    for (const [key, value] of Object.entries(replacements)) {
      normalized[key] = value instanceof Date ? toSqlUtc(value) : value;
    }
    return sequelize.query(sql, { replacements: normalized, type: QueryTypes.SELECT });
  };
}

/** WHERE-Teil für PageVisits im Zeitraum inkl. Quellen-/Kanal-Filter. */
function visitWhere(filter, alias = "") {
  const col = (name) => (alias ? `${alias}.${name}` : name);
  let sql = `${col("visited_at")} >= :from AND ${col("visited_at")} < :to`;
  if (filter.source) sql += ` AND ${col("source")} = :filterSource`;
  if (filter.channel) sql += ` AND ${col("channel")} = :filterChannel`;
  return sql;
}

function cartWhere(filter) {
  let sql = "createdAt >= :from AND createdAt < :to";
  if (filter.source) sql += " AND trafficSource = :filterSource";
  if (filter.channel) sql += " AND trafficChannel = :filterChannel";
  return sql;
}

const isFiltered = (filter) => Boolean(filter.source || filter.channel);

async function visitSummary(query, filter, from, to) {
  const [row] = await query(
    `
      SELECT
        COUNT(*) AS visitors,
        COALESCE(SUM(views), 0) AS pageviews,
        COALESCE(SUM(CASE WHEN views = 1 THEN 1 ELSE 0 END), 0) AS bounced,
        AVG(duration) AS avgDuration
      FROM (
        SELECT session_id, COUNT(*) AS views, SUM(COALESCE(duration_seconds, 0)) AS duration
        FROM PageVisits
        WHERE ${visitWhere(filter)}
        GROUP BY session_id
      ) v
    `,
    { from, to, filterSource: filter.source, filterChannel: filter.channel },
  );
  const visitors = toNumber(row?.visitors);
  return {
    visitors,
    pageviews: toNumber(row?.pageviews),
    bounceRate: visitors > 0 ? (toNumber(row?.bounced) / visitors) * 100 : 0,
    avgDuration: Math.round(toNumber(row?.avgDuration)),
  };
}

/**
 * Bestellungen & Umsatz. Ohne Filter aus den Verträgen; mit Quellen-Filter
 * aus den abgeschlossenen Warenkörben, die dieser Quelle zugeordnet sind.
 */
async function orderSummary(query, filter, from, to) {
  const replacements = {
    from,
    to,
    filterSource: filter.source,
    filterChannel: filter.channel,
  };
  const [row] = isFiltered(filter)
    ? await query(
        `
          SELECT COUNT(*) AS orders, COALESCE(SUM(calculatedMonthlyPrice), 0) AS revenue
          FROM Carts
          WHERE completed = 1 AND ${cartWhere(filter)}
        `,
        replacements,
      )
    : await query(
        `
          SELECT COUNT(*) AS orders, COALESCE(SUM(monthlyPrice), 0) AS revenue
          FROM Contracts
          WHERE createdAt >= :from AND createdAt < :to AND deletedAt IS NULL
        `,
        replacements,
      );
  return { orders: toNumber(row?.orders), revenue: toNumber(row?.revenue) };
}

function buildKpis(visits, orders) {
  return {
    visitors: visits.visitors,
    pageviews: visits.pageviews,
    bounceRate: visits.bounceRate,
    avgDuration: visits.avgDuration,
    orders: orders.orders,
    revenue: orders.revenue,
    conversionRate: visits.visitors > 0 ? (orders.orders / visits.visitors) * 100 : 0,
    revenuePerVisitor: visits.visitors > 0 ? orders.revenue / visits.visitors : 0,
  };
}

async function visitorSeries(query, filter, range, keys, dimension) {
  const rows = await query(
    `
      SELECT
        ${bucketSql("visited_at", range.bucket)} AS bucket,
        COALESCE(${dimension}, '${DIRECT_NAME}') AS name,
        COUNT(DISTINCT session_id) AS visitors
      FROM PageVisits
      WHERE ${visitWhere(filter)}
      GROUP BY bucket, name
    `,
    {
      from: range.from,
      to: range.to,
      tzOffset: range.offsetMinutes,
      filterSource: filter.source,
      filterChannel: filter.channel,
    },
  );

  const indexByKey = new Map(keys.map((key, i) => [key, i]));
  const byName = new Map();
  for (const row of rows) {
    const index = indexByKey.get(row.bucket);
    if (index === undefined) continue;
    if (!byName.has(row.name)) {
      byName.set(row.name, { name: row.name, total: 0, data: keys.map(() => 0) });
    }
    const series = byName.get(row.name);
    const count = toNumber(row.visitors);
    series.data[index] += count;
    series.total += count;
  }
  return [...byName.values()].sort((a, b) => b.total - a.total);
}

async function orderSeries(query, filter, range, keys) {
  const replacements = {
    from: range.from,
    to: range.to,
    tzOffset: range.offsetMinutes,
    filterSource: filter.source,
    filterChannel: filter.channel,
  };
  const rows = isFiltered(filter)
    ? await query(
        `
          SELECT ${bucketSql("createdAt", range.bucket)} AS bucket, COUNT(*) AS orders
          FROM Carts
          WHERE completed = 1 AND ${cartWhere(filter)}
          GROUP BY bucket
        `,
        replacements,
      )
    : await query(
        `
          SELECT ${bucketSql("createdAt", range.bucket)} AS bucket, COUNT(*) AS orders
          FROM Contracts
          WHERE createdAt >= :from AND createdAt < :to AND deletedAt IS NULL
          GROUP BY bucket
        `,
        replacements,
      );
  const byKey = new Map(rows.map((r) => [r.bucket, toNumber(r.orders)]));
  return keys.map((key) => byKey.get(key) || 0);
}

/** Besucher je Quelle/Kanal plus zugeordnete Warenkörbe & Abschlüsse. */
async function attributionBreakdown(query, filter, range, dimension) {
  const cartColumn = dimension === "source" ? "trafficSource" : "trafficChannel";
  const replacements = {
    from: range.from,
    to: range.to,
    filterSource: filter.source,
    filterChannel: filter.channel,
  };

  const visitorRows = await query(
    `
      SELECT
        COALESCE(${dimension}, '${DIRECT_NAME}') AS name,
        MAX(channel) AS channel,
        COUNT(DISTINCT session_id) AS visitors
      FROM PageVisits
      WHERE ${visitWhere(filter)}
      GROUP BY name
      ORDER BY visitors DESC
      LIMIT 50
    `,
    replacements,
  );

  const cartRows = await query(
    `
      SELECT
        ${cartColumn} AS name,
        COUNT(*) AS carts,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS orders,
        SUM(CASE WHEN completed = 1 THEN COALESCE(calculatedMonthlyPrice, 0) ELSE 0 END) AS revenue
      FROM Carts
      WHERE ${cartColumn} IS NOT NULL AND ${cartWhere(filter)}
      GROUP BY ${cartColumn}
    `,
    replacements,
  );
  const cartsByName = new Map(cartRows.map((r) => [r.name, r]));

  return visitorRows.map((row) => {
    const visitors = toNumber(row.visitors);
    const carts = cartsByName.get(row.name);
    const orders = toNumber(carts?.orders);
    return {
      name: row.name,
      channel: dimension === "source" ? row.channel || DIRECT_NAME : row.name,
      visitors,
      carts: toNumber(carts?.carts),
      orders,
      revenue: toNumber(carts?.revenue),
      conversionRate: visitors > 0 ? (orders / visitors) * 100 : 0,
    };
  });
}

async function simpleBreakdown(query, filter, range, column, limit = 20) {
  const rows = await query(
    `
      SELECT ${column} AS name, COUNT(DISTINCT session_id) AS visitors, COUNT(*) AS pageviews
      FROM PageVisits
      WHERE ${visitWhere(filter)} AND ${column} IS NOT NULL AND ${column} <> ''
      GROUP BY ${column}
      ORDER BY visitors DESC
      LIMIT ${Number(limit)}
    `,
    {
      from: range.from,
      to: range.to,
      filterSource: filter.source,
      filterChannel: filter.channel,
    },
  );
  return rows.map((r) => ({
    name: r.name,
    visitors: toNumber(r.visitors),
    pageviews: toNumber(r.pageviews),
  }));
}

async function entryPages(query, filter, range) {
  const rows = await query(
    `
      SELECT p.page_url AS name, COUNT(*) AS visitors
      FROM PageVisits p
      INNER JOIN (
        SELECT MIN(id) AS id
        FROM PageVisits
        WHERE ${visitWhere(filter)}
        GROUP BY session_id
      ) firstHit ON firstHit.id = p.id
      GROUP BY p.page_url
      ORDER BY visitors DESC
      LIMIT 20
    `,
    {
      from: range.from,
      to: range.to,
      filterSource: filter.source,
      filterChannel: filter.channel,
    },
  );
  return rows.map((r) => ({ name: r.name || "/", visitors: toNumber(r.visitors) }));
}

async function onlineNow(query, filter) {
  const [row] = await query(
    `
      SELECT COUNT(DISTINCT session_id) AS online
      FROM PageVisits
      WHERE updatedAt >= :since
        ${filter.source ? "AND source = :filterSource" : ""}
        ${filter.channel ? "AND channel = :filterChannel" : ""}
    `,
    {
      since: new Date(Date.now() - 5 * 60 * 1000),
      filterSource: filter.source,
      filterChannel: filter.channel,
    },
  );
  return toNumber(row?.online);
}

async function buildDashboardStats(range, rawFilter = {}) {
  const filter = {
    source: rawFilter.source || null,
    channel: rawFilter.channel || null,
  };
  const query = createQuery();
  const keys = bucketKeys(range);

  const [
    currentVisits,
    previousVisits,
    currentOrders,
    previousOrders,
    bySource,
    byChannel,
    orders,
    sources,
    channels,
    pages,
    entry,
    online,
  ] = await Promise.all([
    visitSummary(query, filter, range.from, range.to),
    visitSummary(query, filter, range.previousFrom, range.previousTo),
    orderSummary(query, filter, range.from, range.to),
    orderSummary(query, filter, range.previousFrom, range.previousTo),
    visitorSeries(query, filter, range, keys, "source"),
    visitorSeries(query, filter, range, keys, "channel"),
    orderSeries(query, filter, range, keys),
    attributionBreakdown(query, filter, range, "source"),
    attributionBreakdown(query, filter, range, "channel"),
    simpleBreakdown(query, filter, range, BREAKDOWN_COLUMNS.pages),
    entryPages(query, filter, range),
    onlineNow(query, filter),
  ]);

  const otherBreakdowns = {};
  for (const key of ["campaigns", "hostnames", "countries", "cities", "devices", "browsers", "os"]) {
    otherBreakdowns[key] = await simpleBreakdown(
      query,
      filter,
      range,
      BREAKDOWN_COLUMNS[key],
    );
  }

  return {
    range: {
      key: range.key,
      label: range.label,
      bucket: range.bucket,
      from: range.from,
      to: range.to,
    },
    filter,
    ordersAttributed: isFiltered(filter),
    kpis: buildKpis(currentVisits, currentOrders),
    previousKpis: buildKpis(previousVisits, previousOrders),
    online,
    timeseries: { buckets: keys, bySource, byChannel, orders },
    breakdowns: {
      sources,
      channels,
      pages,
      entryPages: entry,
      ...otherBreakdowns,
    },
  };
}

module.exports = { buildDashboardStats };
