"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cartsDesc = await queryInterface.describeTable("Carts").catch(() => null);
    if (cartsDesc && !cartsDesc.lastCheckoutStep) {
      await queryInterface.addColumn("Carts", "lastCheckoutStep", {
        type: Sequelize.STRING(64),
        allowNull: true,
      });
    }
    if (cartsDesc && !cartsDesc.clientErrorCount) {
      await queryInterface.addColumn("Carts", "clientErrorCount", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    await queryInterface.createTable("CartCheckoutEvents", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      cartId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "Carts",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      accessToken: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      sessionId: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      eventType: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      stepId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      stepName: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      pageUrl: {
        type: Sequelize.STRING(2048),
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex("CartCheckoutEvents", ["cartId", "createdAt"], {
      name: "cart_checkout_events_cart_created",
    });
    await queryInterface.addIndex(
      "CartCheckoutEvents",
      ["eventType", "stepName"],
      { name: "cart_checkout_events_type_step" },
    );
    await queryInterface.addIndex("CartCheckoutEvents", ["accessToken"], {
      name: "cart_checkout_events_access_token",
    });

    await queryInterface.createTable("CartClientErrors", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      cartId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "Carts",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      accessToken: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      sessionId: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      message: {
        type: Sequelize.STRING(1024),
        allowNull: false,
      },
      stack: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      source: {
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: "window",
      },
      pageUrl: {
        type: Sequelize.STRING(2048),
        allowNull: true,
      },
      stepName: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      userAgent: {
        type: Sequelize.STRING(512),
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex("CartClientErrors", ["cartId"], {
      name: "cart_client_errors_cart_id",
    });
    await queryInterface.addIndex("CartClientErrors", ["accessToken"], {
      name: "cart_client_errors_access_token",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("CartClientErrors");
    await queryInterface.dropTable("CartCheckoutEvents");

    const cartsDesc = await queryInterface.describeTable("Carts").catch(() => null);
    if (cartsDesc?.clientErrorCount) {
      await queryInterface.removeColumn("Carts", "clientErrorCount");
    }
    if (cartsDesc?.lastCheckoutStep) {
      await queryInterface.removeColumn("Carts", "lastCheckoutStep");
    }
  },
};
