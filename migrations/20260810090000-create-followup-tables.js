"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("followup_rules", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      key: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      trigger_event: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      timing_type: {
        type: Sequelize.ENUM("after_event", "before_anchor"),
        allowNull: false,
        defaultValue: "after_event",
      },
      delay_minutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      anchor_field: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      cancel_conditions: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      subject: {
        type: Sequelize.STRING(512),
        allowNull: false,
      },
      body_html: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex("followup_rules", ["trigger_event", "is_active"], {
      name: "followup_rules_event_active",
    });

    await queryInterface.createTable("followup_jobs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      rule_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "followup_rules",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      cart_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Carts",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      car_abo_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "CarAbos",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      send_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM(
          "pending",
          "processing",
          "sent",
          "cancelled",
          "failed",
        ),
        allowNull: false,
        defaultValue: "pending",
      },
      cancel_reason: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex("followup_jobs", ["rule_id", "cart_id"], {
      unique: true,
      name: "followup_jobs_rule_cart_unique",
    });
    await queryInterface.addIndex("followup_jobs", ["status", "send_at"], {
      name: "followup_jobs_status_send_at",
    });
    await queryInterface.addIndex("followup_jobs", ["cart_id", "status"], {
      name: "followup_jobs_cart_status",
    });

    const now = new Date();

    await queryInterface.bulkInsert("followup_rules", [
      {
        id: "a1000000-0000-4000-8000-000000000001",
        key: "checkout_help",
        name: "Checkout-Hilfe",
        trigger_event: "cart_user_attached",
        timing_type: "after_event",
        delay_minutes: 10,
        anchor_field: null,
        cancel_conditions: JSON.stringify(["cart_completed"]),
        subject: "Braucht du Hilfe bei deinem Auto Abo?",
        body_html: [
          "<p>Hallo {{firstName}},</p>",
          "<p>du hast vor Kurzem die Konfiguration für <strong>{{carName}}</strong> gestartet.</p>",
          "<p>Gibt es Probleme beim Abschluss? Wir helfen dir gerne weiter.</p>",
          '<p><a href="{{checkoutUrl}}" style="display:inline-block;background-color:#82ba26;padding:8px 16px;border-radius:12px;color:#ffffff;text-decoration:none;font-weight:900;">Checkout fortsetzen</a></p>',
          "<p>Bei Fragen erreichst du uns unter <a href=\"mailto:info@gruene-flotte-autoabo.de\">info@gruene-flotte-autoabo.de</a>.</p>",
          "<p><strong>Dein Grüne Flotte Team</strong></p>",
        ].join(""),
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: "a1000000-0000-4000-8000-000000000002",
        key: "checkout_still_available",
        name: "Auto noch verfügbar",
        trigger_event: "cart_user_attached",
        timing_type: "after_event",
        delay_minutes: 4320,
        anchor_field: null,
        cancel_conditions: JSON.stringify([
          "cart_completed",
          "car_unavailable",
        ]),
        subject: "Dein Auto ist noch verfügbar",
        body_html: [
          "<p>Hallo {{firstName}},</p>",
          "<p><strong>{{carName}}</strong> ist noch verfügbar – dein Checkout wartet auf dich.</p>",
          "<p>Schließe die Buchung jetzt ab, solange das Fahrzeug frei ist.</p>",
          '<p><a href="{{checkoutUrl}}" style="display:inline-block;background-color:#82ba26;padding:8px 16px;border-radius:12px;color:#ffffff;text-decoration:none;font-weight:900;">Jetzt fortsetzen</a></p>',
          "<p><strong>Dein Grüne Flotte Team</strong></p>",
        ].join(""),
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("followup_jobs");
    await queryInterface.dropTable("followup_rules");
  },
};
