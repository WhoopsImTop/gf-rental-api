"use strict";
const { Model } = require("sequelize");
const { encrypt, isEncrypted, decrypt } = require("../services/encryption");
module.exports = (sequelize, DataTypes) => {
  class Review extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Review.init(
    {
      rating: DataTypes.INTEGER,
      email: DataTypes.STRING,
      review: DataTypes.TEXT,
      category: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: "Review",
    }
  );

  Review.beforeCreate((review, options) => {
    if (
      Review.dataValues["email"] &&
      !isEncrypted(Review.dataValues["email"])
    ) {
      Review.dataValues["email"] = encrypt(Review.dataValues["email"]);
    }
  });

  Review.afterFind((Review, options) => {
    if (Review) {
      if (Array.isArray(Review)) {
        Review.forEach((record) => {
          if (record.dataValues.email && isEncrypted(record.dataValues.email)) {
            record.dataValues.email = decrypt(record.dataValues.email);
          }
        });
      } else {
        if (Review.dataValues.email && isEncrypted(Review.dataValues.email)) {
          Review.dataValues.email = decrypt(Review.dataValues.email);
        }
      }
    }
  });
  return Review;
};
