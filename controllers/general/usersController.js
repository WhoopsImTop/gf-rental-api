const db = require("../../models");
const { Op } = require("sequelize");
const { createHash } = require("../../services/encryption");

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
    return res.status(500).send({ error: "An unexpected error occurred" });
  }
};

exports.updateCrmUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone, role } = req.body;

    const user = await db.User.scope("withPassword").findByPk(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;

    if (email !== undefined) {
      updateData.email = email;
      updateData.emailHash = createHash(email);
    }

    await user.update(updateData);

    return res.status(200).json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).send({ error: "An unexpected error occurred" });
  }
};
