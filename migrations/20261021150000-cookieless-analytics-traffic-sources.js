"use strict";

const {
  classifyTraffic,
  sanitizeReferrerHost,
} = require("../services/analytics/trafficSource");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const pageVisitColumns = {
      pageview_id: { type: Sequelize.STRING(32), allowNull: true },
      hostname: { type: Sequelize.STRING(128), allowNull: true },
      source: { type: Sequelize.STRING(64), allowNull: true },
      channel: { type: Sequelize.STRING(32), allowNull: true },
      utm_source: { type: Sequelize.STRING(128), allowNull: true },
      utm_medium: { type: Sequelize.STRING(128), allowNull: true },
      city: { type: Sequelize.STRING(128), allowNull: true },
      device: { type: Sequelize.STRING(16), allowNull: true },
      browser: { type: Sequelize.STRING(32), allowNull: true },
      os: { type: Sequelize.STRING(32), allowNull: true },
    };
    for (const [name, definition] of Object.entries(pageVisitColumns)) {
      await queryInterface.addColumn("PageVisits", name, definition);
    }

    await queryInterface.addIndex("PageVisits", ["visited_at"], {
      name: "page_visits_visited_at",
    });
    await queryInterface.addIndex("PageVisits", ["session_id"], {
      name: "page_visits_session_id",
    });
    await queryInterface.addIndex("PageVisits", ["pageview_id"], {
      name: "page_visits_pageview_id",
    });
    await queryInterface.addIndex("PageVisits", ["source", "visited_at"], {
      name: "page_visits_source_visited_at",
    });

    await queryInterface.createTable("AnalyticsSalts", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      day: { type: Sequelize.STRING(10), allowNull: false, unique: true },
      salt: { type: Sequelize.STRING(64), allowNull: false },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.addColumn("Carts", "trafficSource", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn("Carts", "trafficChannel", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });

    // --- Datenschutz-Bereinigung der Altdaten ---------------------------
    // Query-Strings konnten Warenkorb-Tokens (?t=…) enthalten.
    await queryInterface.sequelize.query(`
      UPDATE PageVisits
      SET page_url = SUBSTRING_INDEX(SUBSTRING_INDEX(page_url, '#', 1), '?', 1),
          ip_address = NULL
    `);

    // Vollständige Referrer-URLs → nur Hostname; Quelle/Kanal nachtragen.
    const [combos] = await queryInterface.sequelize.query(`
      SELECT DISTINCT referrer, campaign FROM PageVisits
    `);
    for (const { referrer, campaign } of combos) {
      const referrerHost = sanitizeReferrerHost(referrer);
      // "campaign" war bisher utm_campaign || utm_source || campaign.
      const fromUtm = campaign
        ? classifyTraffic({ utmSource: campaign })
        : null;
      const attribution =
        fromUtm && fromUtm.channel !== "Kampagne"
          ? fromUtm
          : classifyTraffic({ referrerHost });

      await queryInterface.sequelize.query(
        `
          UPDATE PageVisits
          SET referrer = :referrerHost, source = :source, channel = :channel
          WHERE referrer <=> :referrer AND campaign <=> :campaign
        `,
        {
          replacements: {
            referrerHost,
            source: attribution.source,
            channel: attribution.channel,
            referrer,
            campaign,
          },
        },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Carts", "trafficChannel");
    await queryInterface.removeColumn("Carts", "trafficSource");
    await queryInterface.dropTable("AnalyticsSalts");

    await queryInterface.removeIndex("PageVisits", "page_visits_source_visited_at");
    await queryInterface.removeIndex("PageVisits", "page_visits_pageview_id");
    await queryInterface.removeIndex("PageVisits", "page_visits_session_id");
    await queryInterface.removeIndex("PageVisits", "page_visits_visited_at");

    for (const name of [
      "os",
      "browser",
      "device",
      "city",
      "utm_medium",
      "utm_source",
      "channel",
      "source",
      "hostname",
      "pageview_id",
    ]) {
      await queryInterface.removeColumn("PageVisits", name);
    }
  },
};
