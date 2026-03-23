'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Helper to check if a column exists
    const hasColumn = async (table, column) => {
      const desc = await queryInterface.describeTable(table);
      return column in desc;
    };

    // --- CarAboPrices ---
    if (await hasColumn('CarAboPrices', 'priceNoDeposit')) {
      await queryInterface.renameColumn('CarAboPrices', 'priceNoDeposit', 'priceFixedDuration');
    }
    if (await hasColumn('CarAboPrices', 'priceWithDeposit')) {
      await queryInterface.renameColumn('CarAboPrices', 'priceWithDeposit', 'priceMinimumDuration');
    }

    // --- Carts ---
    if (!(await hasColumn('Carts', 'durationType'))) {
      await queryInterface.addColumn('Carts', 'durationType', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'fixed',
      });
    }
    if (await hasColumn('Carts', 'withDeposit')) {
      await queryInterface.sequelize.query(
        `UPDATE \`Carts\` SET \`durationType\` = CASE WHEN \`withDeposit\` = true THEN 'minimum' ELSE 'fixed' END`
      );
      await queryInterface.removeColumn('Carts', 'withDeposit');
    }

    // --- Contracts ---
    if (!(await hasColumn('Contracts', 'durationType'))) {
      await queryInterface.addColumn('Contracts', 'durationType', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'fixed',
      });
    }
    if (await hasColumn('Contracts', 'withDeposit')) {
      await queryInterface.sequelize.query(
        `UPDATE \`Contracts\` SET \`durationType\` = CASE WHEN \`withDeposit\` = true THEN 'minimum' ELSE 'fixed' END`
      );
      await queryInterface.removeColumn('Contracts', 'withDeposit');
    }
  },

  async down(queryInterface, Sequelize) {
    const hasColumn = async (table, column) => {
      const desc = await queryInterface.describeTable(table);
      return column in desc;
    };

    // --- Carts ---
    if (!(await hasColumn('Carts', 'withDeposit'))) {
      await queryInterface.addColumn('Carts', 'withDeposit', {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      });
    }
    if (await hasColumn('Carts', 'durationType')) {
      await queryInterface.sequelize.query(
        `UPDATE \`Carts\` SET \`withDeposit\` = CASE WHEN \`durationType\` = 'minimum' THEN true ELSE false END`
      );
      await queryInterface.removeColumn('Carts', 'durationType');
    }

    // --- Contracts ---
    if (!(await hasColumn('Contracts', 'withDeposit'))) {
      await queryInterface.addColumn('Contracts', 'withDeposit', {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      });
    }
    if (await hasColumn('Contracts', 'durationType')) {
      await queryInterface.sequelize.query(
        `UPDATE \`Contracts\` SET \`withDeposit\` = CASE WHEN \`durationType\` = 'minimum' THEN true ELSE false END`
      );
      await queryInterface.removeColumn('Contracts', 'durationType');
    }

    // --- CarAboPrices ---
    if (await hasColumn('CarAboPrices', 'priceFixedDuration')) {
      await queryInterface.renameColumn('CarAboPrices', 'priceFixedDuration', 'priceNoDeposit');
    }
    if (await hasColumn('CarAboPrices', 'priceMinimumDuration')) {
      await queryInterface.renameColumn('CarAboPrices', 'priceMinimumDuration', 'priceWithDeposit');
    }
  }
};
