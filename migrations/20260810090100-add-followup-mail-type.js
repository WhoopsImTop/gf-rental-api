"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE `EmailLogs` MODIFY COLUMN `mailType` ENUM('otp','password_reset','notification','error','custom','contact','feedback','admin_notification','followup') NOT NULL;",
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE `EmailLogs` MODIFY COLUMN `mailType` ENUM('otp','password_reset','notification','error','custom','contact','feedback','admin_notification') NOT NULL;",
    );
  },
};
