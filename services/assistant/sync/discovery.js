"use strict";

const config = require("../config");
const { fetchJson, fetchUrl } = require("./fetcher");
const { decodeEntities, slugFromUrl } = require("../util");

const REST_FIELDS = "id,slug,link,modified_gmt,date_gmt,title,parent,yoast_head_json";

function robotsOf(item) {
  const robots = item.yoast_head_json?.robots;
  if (!robots) return null;
  return [robots.index, robots.follow].filter(Boolean).join(", ") || null;
}

/** Automatische Scope-Regeln. Ergebnis: Grund für den Ausschluss oder null. */
function exclusionReason({ type, slug, publishedAt }) {
  if (type === "page") {
    if (config.EXCLUDED_SLUGS.has(slug)) return "scope_excluded_slug";
    if (config.EXCLUDED_SLUG_PATTERNS.some((re) => re.test(slug))) return "scope_duplicate_page";
  }
  if (type === "post" && publishedAt) {
    const ageDays = (Date.now() - new Date(publishedAt).getTime()) / 86_400_000;
    if (ageDays > config.NEWS_MAX_AGE_DAYS) return "news_too_old";
  }
  return null;
}

async function fetchAllRest(endpoint) {
  const items = [];
  for (let page = 1; page <= 20; page += 1) {
    const url = `${config.SITE_BASE}/wp-json/wp/v2/${endpoint}?per_page=100&page=${page}&_fields=${REST_FIELDS}`;
    const { data, headers } = await fetchJson(url);
    if (!Array.isArray(data)) break;
    items.push(...data);
    const totalPages = Number(headers["x-wp-totalpages"] || 1);
    if (page >= totalPages) break;
  }
  return items;
}

/** Fallback, falls die REST-API nicht erreichbar ist: Yoast-Sitemaps. */
async function fetchSitemap(name) {
  const { data } = await fetchUrl(`${config.SITE_BASE}/${name}`);
  const entries = [];
  for (const match of String(data).matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = match[1].match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
    const lastmod = match[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim();
    if (loc) entries.push({ loc, lastmod: lastmod || null });
  }
  return entries;
}

function buildBreadcrumbs(pages) {
  const byId = new Map(pages.map((page) => [page.id, page]));
  return (page) => {
    const trail = [];
    let current = page;
    for (let depth = 0; current && depth < 6; depth += 1) {
      trail.unshift(decodeEntities(current.title?.rendered || current.slug));
      current = current.parent ? byId.get(current.parent) : null;
    }
    return trail;
  };
}

function toSource(type, item, breadcrumb) {
  const slug = item.slug || slugFromUrl(item.link);
  const publishedAt = type === "post" && item.date_gmt ? `${item.date_gmt}Z` : null;
  return {
    source_key: `${type}:${item.id}`,
    type,
    url: item.link,
    wp_id: item.id,
    slug,
    title: decodeEntities(item.title?.rendered || slug),
    breadcrumb,
    robots: robotsOf(item),
    lastmod: item.modified_gmt ? `${item.modified_gmt}Z` : null,
    published_at: publishedAt,
    excluded_reason: exclusionReason({ type, slug, publishedAt }),
  };
}

/**
 * Ermittelt alle Seiten und Beiträge der Website.
 * Primär über die WP-REST-API (IDs, modified, robots), sonst über die Sitemaps.
 */
async function discoverWebsite() {
  try {
    const [pages, posts] = await Promise.all([fetchAllRest("pages"), fetchAllRest("posts")]);
    const breadcrumbOf = buildBreadcrumbs(pages);
    return [
      ...pages.map((page) => toSource("page", page, breadcrumbOf(page))),
      ...posts.map((post) => toSource("post", post, ["News", decodeEntities(post.title?.rendered || "")])),
    ];
  } catch (error) {
    const [pages, posts] = await Promise.all([fetchSitemap("page-sitemap.xml"), fetchSitemap("post-sitemap.xml")]);
    const fromSitemap = (type) => (entry) => {
      const slug = slugFromUrl(entry.loc);
      return {
        source_key: `${type}:url:${entry.loc}`,
        type,
        url: entry.loc,
        wp_id: null,
        slug,
        title: slug,
        breadcrumb: [slug],
        robots: null,
        lastmod: entry.lastmod,
        published_at: null,
        excluded_reason: exclusionReason({ type, slug, publishedAt: null }),
        discovery_warning: `REST-API nicht erreichbar (${error.message}), Sitemap verwendet`,
      };
    };
    return [...pages.map(fromSitemap("page")), ...posts.map(fromSitemap("post"))];
  }
}

module.exports = { discoverWebsite, exclusionReason };
