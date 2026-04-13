const db = require("../../models");
const { logger } = require("../../services/logging");

const escapeXml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const getFrontendBaseUrl = () => {
  const baseUrl =
    process.env.SITEMAP_FRONTEND_BASE_URL || process.env.FRONTEND_BASE_URL;
  return typeof baseUrl === "string" ? baseUrl.trim().replace(/\/+$/, "") : "";
};

exports.getVehicleSitemap = async (req, res) => {
  const frontendBaseUrl = getFrontendBaseUrl();

  if (!frontendBaseUrl) {
    return res.status(500).send("Sitemap base URL is not configured");
  }

  try {
    const carAbos = await db.CarAbo.findAll({
      where: { status: "available" },
      attributes: ["id", "updatedAt", "createdAt"],
      order: [["id", "ASC"]],
    });

    const urlEntries = carAbos
      .map((carAbo) => {
        const lastModifiedDate = carAbo.updatedAt || carAbo.createdAt;
        const lastModified = lastModifiedDate
          ? new Date(lastModifiedDate).toISOString()
          : null;
        const vehicleUrl = `${frontendBaseUrl}/${carAbo.id}`;

        return [
          "<url>",
          `<loc>${escapeXml(vehicleUrl)}</loc>`,
          lastModified ? `<lastmod>${escapeXml(lastModified)}</lastmod>` : "",
          "</url>",
        ]
          .filter(Boolean)
          .join("");
      })
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
      `${urlEntries}` +
      `</urlset>`;

    res.set("Content-Type", "application/xml; charset=utf-8");
    return res.status(200).send(xml);
  } catch (error) {
    logger("error", `[getVehicleSitemap] ${error.message}`);
    return res.status(500).send("Failed to generate sitemap");
  }
};
