'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('PageVisits', 'referrer', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.addColumn('PageVisits', 'campaign', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('PageVisits', 'referrer');
    await queryInterface.removeColumn('PageVisits', 'campaign');
  }
};
