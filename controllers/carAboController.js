const sequelize = require("sequelize");
const db = require("../models");

exports.createCarAbo = async (req, res) => {
  try {
    const carAbo = await db.CarAbo.create(req.body);
    return res.status(201).json(carAbo);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.findAllCarAbos = async (req, res) => {
  try {
    const carAbos = await db.CarAbo.findAll();
    return res.status(200).json(carAbos);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.findOneCarAbo = async (req, res) => {
  try {
    const { id } = req.params;
    const carAbo = await db.CarAbo.findOne({
      where: { id: id },
    });
    if (carAbo) {
      return res.status(200).json(carAbo);
    } else {
      return res
        .status(404)
        .send("CarAbo with the specified ID does not exist");
    }
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.updateCarAbo = async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.CarAbo.update(req.body, {
      where: { id: id },
    });
    if (updated) {
      const updatedCarAbo = await db.CarAbo.findOne({ where: { id: id } });
      return res.status(200).json(updatedCarAbo);
    } else {
      throw new Error("CarAbo not found");
    }
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.deleteCarAbo = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.CarAbo.destroy({
      where: { id: id },
    });
    if (deleted) {
      return res.status(204).send("CarAbo deleted");
    } else {
      throw new Error("CarAbo not found");
    }
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};
