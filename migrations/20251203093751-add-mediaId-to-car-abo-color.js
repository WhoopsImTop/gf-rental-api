'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add mediaId column
    await queryInterface.addColumn('CarAboColors', 'mediaId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Media',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Remove vehicleImageUrl column
    await queryInterface.removeColumn('CarAboColors', 'vehicleImageUrl');
  },

  async down(queryInterface, Sequelize) {
    // Add vehicleImageUrl back
    await queryInterface.addColumn('CarAboColors', 'vehicleImageUrl', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Remove mediaId column
    await queryInterface.removeColumn('CarAboColors', 'mediaId');
  }
};
