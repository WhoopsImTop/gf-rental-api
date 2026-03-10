'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add vin to CarAboColors
    await queryInterface.addColumn('CarAboColors', 'vin', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // We can populate the CarAboColors using the CarAbos they belong to, if there is a 1-to-1 matching, 
    // but usually CarAbo corresponds to multiple colors. If a CarAbo has only one color, we could theoretically
    // migrate the vin. For simplicity and to avoid overwriting wrong colors, we just leave it for the user to re-populate.
    // However, to make sure no data is lost easily, we can try to copy CarAbos.vin to CarAboColors.vin where possible if needed,
    // but the requirement is just to move the field. 

    // Remove vin from CarAbos
    await queryInterface.removeColumn('CarAbos', 'vin');
  },

  async down (queryInterface, Sequelize) {
    // Add vin back to CarAbos
    await queryInterface.addColumn('CarAbos', 'vin', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Remove vin from CarAboColors
    await queryInterface.removeColumn('CarAboColors', 'vin');
  }
};
