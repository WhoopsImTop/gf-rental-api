'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // We are changing the structure significantly.
    // Easier to drop validation/columns or recreate, but let's alter.

    // 1. Remove old columns (safely)
    try { await queryInterface.removeColumn('Carts', 'cartContent'); } catch(e) {}
    try { await queryInterface.removeColumn('Carts', 'isOrdered'); } catch(e) {}

    // 2. Add new columns
    // Use try/catch or just add. If they fail, it might mean they exist or table issue.
    // Assuming clean state or specific migration failure.
    
    // Helper to add safely
    const safeAdd = async (col, type, opts = {}) => {
        try {
             await queryInterface.addColumn('Carts', col, { type, ...opts });
        } catch(e) { console.log(`Skipping add ${col}`); }
    };

    await safeAdd('carAboId', Sequelize.INTEGER, { allowNull: true });
    await safeAdd('colorId', Sequelize.INTEGER, { allowNull: true });
    await safeAdd('priceId', Sequelize.INTEGER, { allowNull: true });
    await safeAdd('withDeposit', Sequelize.BOOLEAN, { defaultValue: true });
    await safeAdd('completed', Sequelize.BOOLEAN, { defaultValue: false });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert
    await queryInterface.removeColumn('Carts', 'completed');
    await queryInterface.removeColumn('Carts', 'withDeposit');
    await queryInterface.removeColumn('Carts', 'priceId');
    await queryInterface.removeColumn('Carts', 'colorId');
    await queryInterface.removeColumn('Carts', 'carAboId');

    await queryInterface.addColumn('Carts', 'isOrdered', {
       type: Sequelize.BOOLEAN,
       defaultValue: false
    });
    await queryInterface.addColumn('Carts', 'cartContent', {
       type: Sequelize.JSON,
       allowNull: false
    });
  }
};
