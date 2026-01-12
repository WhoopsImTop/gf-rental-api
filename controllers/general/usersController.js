const db = require("../../models");
const { Op } = require("sequelize");

exports.getCrmUsers = async (req, res) => {
  try {
    const users = await db.User.findAll({
      where: {
        role: {
          [Op.in]: ["customer", "admin", "seller"],
        },
      },
    });

    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};
