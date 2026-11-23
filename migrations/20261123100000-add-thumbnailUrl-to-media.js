"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Kleine WebP-Vorschau für die Mediathek; null = kein Thumbnail (PDF, Altbestand).
    await queryInterface.addColumn("Media", "thumbnailUrl", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    // Mediathek-Liste wird neueste zuerst paginiert.
    await queryInterface.addIndex("Media", ["createdAt"], {
      name: "media_created_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Media", "media_created_at");
    await queryInterface.removeColumn("Media", "thumbnailUrl");
  },
};
