const db = require("../../models");

exports.getCrmUsers = async (req, res) => {
  try {
    const users = await db.User.findAll({
      where: {
        role: ["admin", "seller", "aquisition"],
      },
    });
    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};
