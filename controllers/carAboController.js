const db = require("../models");

const carAboIncludes = [
  { model: db.CarAboPrice, as: "prices" },
  {
    model: db.CarAboColor,
    as: "colors",
    include: [{ model: db.Media, as: "media" }],
    where: { isOrdered: false },
  },
  {
    model: db.CarAboMedia,
    as: "media",
    include: [{ model: db.Media, as: "media" }],
  },
  {
    model: db.Seller,
    as: "seller",
  },
];

const carAboAdminIncludes = [
  { model: db.CarAboPrice, as: "prices" },
  {
    model: db.CarAboColor,
    as: "colors",
    include: [{ model: db.Media, as: "media" }],
  },
  {
    model: db.CarAboMedia,
    as: "media",
    include: [{ model: db.Media, as: "media" }],
  },
  {
    model: db.Seller,
    as: "seller",
  },
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

const updateChildren = async (Model, items, carAboId, transaction) => {
  if (!Array.isArray(items)) {
    return;
  }

  const existing = await Model.findAll({
    where: { carAboId },
    transaction,
  });

  const existingMap = new Map(existing.map((item) => [item.id, item]));

  for (const item of items) {
    if (item.id && existingMap.has(item.id)) {
      const { id, carAboId: _, ...data } = item;
      await existingMap.get(id).update(data, { transaction });
      existingMap.delete(id);
    } else {
      const { id: _, ...data } = item;
      await Model.create({ ...data, carAboId }, { transaction });
    }
  }

  for (const leftover of existingMap.values()) {
    await leftover.destroy({ transaction });
  }
};

exports.createCarAbo = async (req, res) => {
  const { prices, colors, media, ...carAboPayload } = req.body;

  // Calculate availableFrom if availableInDays is provided
  if (carAboPayload.availableInDays && !carAboPayload.availableFrom) {
    const today = new Date();
    today.setDate(today.getDate() + parseInt(carAboPayload.availableInDays));
    carAboPayload.availableFrom = today.toISOString().split("T")[0];
  } else if (carAboPayload.availableInDays && carAboPayload.availableFrom) {
    // If both are provided, add days to the provided date
    const baseDate = new Date(carAboPayload.availableFrom);
    baseDate.setDate(
      baseDate.getDate() + parseInt(carAboPayload.availableInDays),
    );
    carAboPayload.availableFrom = baseDate.toISOString().split("T")[0];
  }

  try {
    const createdCarAbo = await db.sequelize.transaction(
      async (transaction) => {
        const carAbo = await db.CarAbo.create(carAboPayload, { transaction });

        if (Array.isArray(prices) && prices.length) {
          await db.CarAboPrice.bulkCreate(
            prices.map((price) => ({ ...price, carAboId: carAbo.id })),
            { transaction },
          );
        }

        if (Array.isArray(colors) && colors.length) {
          await db.CarAboColor.bulkCreate(
            colors.map((color) => ({ ...color, carAboId: carAbo.id })),
            { transaction },
          );
        }

        if (Array.isArray(media) && media.length) {
          await db.CarAboMedia.bulkCreate(
            media.map((m) => ({ ...m, carAboId: carAbo.id })),
            { transaction },
          );
        }

        await carAbo.reload({ include: carAboIncludes, transaction });
        return carAbo;
      },
    );

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

exports.findAllCarAboAdmin = async (req, res) => {
  try {
    const carAbos = await db.CarAbo.findAll({
      include: carAboAdminIncludes,
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

exports.findAvailableCarAbos = async (req, res) => {
  try {
    const carAbos = await db.CarAbo.findAll({
      include: [
        { model: db.CarAboPrice, as: "prices" },
        {
          model: db.CarAboColor,
          as: "colors",
          include: [{ model: db.Media, as: "media" }],
          where: [{ isOrdered: false }],
        },
        {
          model: db.CarAboMedia,
          as: "media",
          include: [{ model: db.Media, as: "media" }],
        },
        {
          model: db.Seller,
          as: "seller",
        },
      ],
      order: [
        ["id", "ASC"],
        [{ model: db.CarAboPrice, as: "prices" }, "durationMonths", "ASC"],
        [{ model: db.CarAboColor, as: "colors" }, "id", "ASC"],
      ],
    });

    const today = new Date();

    const result = carAbos.map((carAbo) => {
      const data = carAbo.toJSON();

      if (data.colors && Array.isArray(data.colors)) {
        data.colors = data.colors.map((color) => {
          const c = { ...color };

          // 1. Wenn availableFrom existiert → das verwenden
          if (c.availableFrom) {
            c.calculatedAvailableFrom = c.availableFrom;
          }
          // 2. Wenn kein availableFrom, aber availableInDays gesetzt ist (auch 0!)
          else if (c.availableInDays != null) {
            const baseDate = new Date(today);
            baseDate.setDate(baseDate.getDate() + Number(c.availableInDays));
            c.calculatedAvailableFrom = baseDate.toISOString().split("T")[0];
          }
          // 3. Sonst bleibt es null
          else {
            c.calculatedAvailableFrom = null;
          }

          return c;
        });
      }

      return data;
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.findOneCarAbo = async (req, res) => {
  try {
    const { id } = req.params;
    const isAvailable = req.query.isAvailable || null;
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
  const { prices, colors, media, ...carAboPayload } = req.body;

  // Calculate availableFrom if availableInDays is provided
  if (carAboPayload.availableInDays && !carAboPayload.availableFrom) {
    const today = new Date();
    today.setDate(today.getDate() + parseInt(carAboPayload.availableInDays));
    carAboPayload.availableFrom = today.toISOString().split("T")[0];
  } else if (carAboPayload.availableInDays && carAboPayload.availableFrom) {
    // If both are provided, add days to the provided date
    const baseDate = new Date(carAboPayload.availableFrom);
    baseDate.setDate(
      baseDate.getDate() + parseInt(carAboPayload.availableInDays),
    );
    carAboPayload.availableFrom = baseDate.toISOString().split("T")[0];
  }

  try {
    const updatedCarAbo = await db.sequelize.transaction(
      async (transaction) => {
        const [affected] = await db.CarAbo.update(carAboPayload, {
          where: { id },
          transaction,
        });
        if (!affected) {
          throw new Error("CarAbo not found");
        }

        if ("prices" in req.body) {
          await updateChildren(db.CarAboPrice, prices ?? [], id, transaction);
        }

        if ("colors" in req.body) {
          await updateChildren(db.CarAboColor, colors ?? [], id, transaction);
        }

        if ("media" in req.body) {
          await updateChildren(db.CarAboMedia, media ?? [], id, transaction);
        }

        const reloaded = await db.CarAbo.findOne({
          where: { id },
          include: carAboIncludes,
          transaction,
        });
        return reloaded;
      },
    );

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
