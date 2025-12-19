'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if column exists first to be safe, or just try add. 
    // Sequelize doesn't have 'addColumnIfNotExists'.
    try {
      await queryInterface.addColumn('CarAboColors', 'isOrdered', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      });
    } catch (e) {
      console.log('Column isOrdered might already exist on CarAboColors, skipping.');
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.removeColumn('CarAboColors', 'isOrdered');
    } catch (e) {
       // ignore
    }
  }
};
