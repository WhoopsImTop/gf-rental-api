'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CarAboMedia extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      CarAboMedia.belongsTo(models.CarAbo);
    }
  }
  CarAboMedia.init({
    carAboId: DataTypes.INTEGER,
    mediaId: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'CarAboMedia',
  });
  return CarAboMedia;
};