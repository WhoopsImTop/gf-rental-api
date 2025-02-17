"use strict";
const { Model } = require("sequelize");
const { encrypt, isEncrypted, decrypt } = require("../services/encryption");
module.exports = (sequelize, DataTypes) => {
  class review extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  review.init(
    {
      rating: DataTypes.INTEGER,
      email: DataTypes.STRING,
      review: DataTypes.TEXT,
      category: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: "review",
    }
  );

  review.beforeCreate((review, options) => {
    if (
      review.dataValues["email"] &&
      !isEncrypted(review.dataValues["email"])
    ) {
      review.dataValues["email"] = encrypt(review.dataValues["email"]);
    }
  });

  review.afterFind((review, options) => {
    if (review) {
      if (Array.isArray(review)) {
        review.forEach((record) => {
          if (record.dataValues.email && isEncrypted(record.dataValues.email)) {
            record.dataValues.email = decrypt(record.dataValues.email);
          }
        });
      } else {
        if (review.dataValues.email && isEncrypted(review.dataValues.email)) {
          review.dataValues.email = decrypt(review.dataValues.email);
        }
      }
    }
  });
  return review;
};
