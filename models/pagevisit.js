'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PageVisit extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  PageVisit.init({
    session_id: DataTypes.STRING,
    ip_address: DataTypes.STRING,
    country: DataTypes.STRING,
    referrer: DataTypes.STRING,
    campaign: DataTypes.STRING,
    page_url: DataTypes.TEXT,
    duration_seconds: DataTypes.INTEGER,
    visited_at: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'PageVisit',
  });
  return PageVisit;
};