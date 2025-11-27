const db = require("../models");

const carAboIncludes = [
  { model: db.CarAboPrice, as: "prices" },
  { model: db.CarAboColor, as: "colors" },
];

const replaceChildren = async (Model, items, carAboId, transaction) => {
  if (!Array.isArray(items)) {
    return;
  }
  await Model.destroy({ where: { carAboId }, transaction });
  if (items.length === 0) {
    return;
  }
  const records = items.map((item) => ({ ...item, carAboId }));
  await Model.bulkCreate(records, { transaction });
};

exports.createCarAbo = async (req, res) => {
  const { prices, colors, ...carAboPayload } = req.body;

  try {
    const createdCarAbo = await db.sequelize.transaction(async (transaction) => {
      const carAbo = await db.CarAbo.create(carAboPayload, { transaction });

      if (Array.isArray(prices) && prices.length) {
        await db.CarAboPrice.bulkCreate(
          prices.map((price) => ({ ...price, carAboId: carAbo.id })),
          { transaction }
        );
      }

      if (Array.isArray(colors) && colors.length) {
        await db.CarAboColor.bulkCreate(
          colors.map((color) => ({ ...color, carAboId: carAbo.id })),
          { transaction }
        );
      }

      await carAbo.reload({ include: carAboIncludes, transaction });
      return carAbo;
    });

    return res.status(201).json(createdCarAbo);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.findAllCarAbos = async (req, res) => {
  try {
    const carAbos = await db.CarAbo.findAll({
      include: carAboIncludes,
      order: [
        ["id", "ASC"],
        [{ model: db.CarAboPrice, as: "prices" }, "durationMonths", "ASC"],
        [{ model: db.CarAboColor, as: "colors" }, "id", "ASC"],
      ],
    });
    return res.status(200).json(carAbos);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.findOneCarAbo = async (req, res) => {
  try {
    const { id } = req.params;
    const carAbo = await db.CarAbo.findOne({
      where: { id },
      include: carAboIncludes,
    });
    if (!carAbo) {
      return res
        .status(404)
        .send("CarAbo with the specified ID does not exist");
    }
    return res.status(200).json(carAbo);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.updateCarAbo = async (req, res) => {
  const { id } = req.params;
  const { prices, colors, ...carAboPayload } = req.body;

  try {
    const updatedCarAbo = await db.sequelize.transaction(async (transaction) => {
      const [affected] = await db.CarAbo.update(carAboPayload, {
        where: { id },
        transaction,
      });
      if (!affected) {
        throw new Error("CarAbo not found");
      }

      if (Array.isArray(prices)) {
        await replaceChildren(db.CarAboPrice, prices, id, transaction);
      }

      if (Array.isArray(colors)) {
        await replaceChildren(db.CarAboColor, colors, id, transaction);
      }

      const reloaded = await db.CarAbo.findOne({
        where: { id },
        include: carAboIncludes,
        transaction,
      });
      return reloaded;
    });

    return res.status(200).json(updatedCarAbo);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.deleteCarAbo = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.CarAbo.destroy({
      where: { id },
    });
    if (!deleted) {
      return res.status(404).send("CarAbo not found");
    }
    return res.status(204).send();
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};
