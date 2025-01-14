'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Session extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Session.init({
    userId: DataTypes.INTEGER,
    token: DataTypes.TEXT,
    expiresAt: DataTypes.DATE,
    ipAdress: DataTypes.STRING,
    location: DataTypes.STRING,
    lat: DataTypes.DECIMAL(10, 8),
    lng: DataTypes.DECIMAL(11, 8),
  }, {
    sequelize,
    modelName: 'Session',
  });
  return Session;
};