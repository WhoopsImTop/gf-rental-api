'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('feedback_questions', 'group_key', {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.addColumn('feedback_questions', 'group_label', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('feedback_questions', 'show_if', {
      type: Sequelize.JSON,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('feedback_questions', 'show_if');
    await queryInterface.removeColumn('feedback_questions', 'group_label');
    await queryInterface.removeColumn('feedback_questions', 'group_key');
  },
};
