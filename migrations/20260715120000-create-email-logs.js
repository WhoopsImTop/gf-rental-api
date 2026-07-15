"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("EmailLogs", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      mailType: {
        type: Sequelize.ENUM(
          "otp",
          "password_reset",
          "notification",
          "error",
          "custom",
          "contact",
          "feedback",
          "admin_notification",
        ),
        allowNull: false,
      },
      fromAddress: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      toAddress: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      ccAddress: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      subject: {
        type: Sequelize.STRING(512),
        allowNull: true,
      },
      bodyText: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      bodyHtml: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      attachmentCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      attachmentMeta: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      messageId: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("sent", "failed", "skipped_dev"),
        allowNull: false,
      },
      errorMessage: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      relatedUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      relatedContractId: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex("EmailLogs", ["createdAt"]);
    await queryInterface.addIndex("EmailLogs", ["mailType"]);
    await queryInterface.addIndex("EmailLogs", ["status"]);
    await queryInterface.addIndex("EmailLogs", ["toAddress"], {
      length: 255,
      name: "email_logs_to_address",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("EmailLogs");
  },
};
