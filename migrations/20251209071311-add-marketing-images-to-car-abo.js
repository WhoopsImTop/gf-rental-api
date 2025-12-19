'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('CarAbos', 'marketingImageDesktop', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    
    await queryInterface.addColumn('CarAbos', 'marketingImageMobile', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('CarAbos', 'marketingImageDesktop');
    await queryInterface.removeColumn('CarAbos', 'marketingImageMobile');
  }
};
