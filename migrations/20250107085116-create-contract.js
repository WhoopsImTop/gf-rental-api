'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Contracts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      differentDeliveryAdress: {
        type: Sequelize.BOOLEAN
      },
      deliveryStreet: {
        type: Sequelize.TEXT
      },
      deliveryHousenumber: {
        type: Sequelize.INTEGER
      },
      deliveryPostalCode: {
        type: Sequelize.INTEGER
      },
      deliveryCountry: {
        type: Sequelize.TEXT
      },
      deliveryNote: {
        type: Sequelize.TEXT
      },
      wantsDelivery: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      deliveryCosts: {
        type: Sequelize.DECIMAL
      },
      startingDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      duration: {
        type: Sequelize.INTEGER
      },
      monthlyPrice: {
        type: Sequelize.DECIMAL,
        allowNull: false,
      },
      totalCost: {
        type: Sequelize.DECIMAL,
        allowNull: false,
      },
      insurancePackage: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      insuranceCosts: {
        type: Sequelize.DECIMAL
      },
      familyAndFriends: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      familyAndFriendsCosts: {
        type: Sequelize.DECIMAL
      },
      familyAndFriendsMembers: {
        type: Sequelize.TEXT
      },
      userId: {
        type: Sequelize.INTEGER
      },
      oderStatus: {
        type: Sequelize.ENUM("started", "completed", "rejected")
      },
      orderCompleted: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      completedBy: {
        type: Sequelize.INTEGER
      },
      archived: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      contractFile: {
        type: Sequelize.STRING
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Contracts');
  }
};