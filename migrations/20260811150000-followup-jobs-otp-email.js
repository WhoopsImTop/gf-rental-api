"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Allow OTP-request follow-ups without a verified user yet.
    await queryInterface.sequelize.query(
      "ALTER TABLE `followup_jobs` MODIFY COLUMN `user_id` INTEGER NULL;",
    );

    const table = await queryInterface.describeTable("followup_jobs");
    if (!table.to_email) {
      await queryInterface.addColumn("followup_jobs", "to_email", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("followup_jobs");
    if (table.to_email) {
      await queryInterface.removeColumn("followup_jobs", "to_email");
    }

    await queryInterface.sequelize.query(
      "ALTER TABLE `followup_jobs` MODIFY COLUMN `user_id` INTEGER NOT NULL;",
    );
  },
};
