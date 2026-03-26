const db = require("../models");
const { logger } = require("../services/logging");

const carAboIncludes = [
  { model: db.CarAboPrice, as: "prices" },
  {
    model: db.CarAboColor,
    as: "colors",
    include: [
      { model: db.Media, as: "media" },
      {
        model: db.CarAboColorMedia,
        as: "exteriorImages",
        include: [{ model: db.Media, as: "media" }],
        separate: true,
        order: [["sortOrder", "ASC"]],
      },
    ],
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
    include: [
      { model: db.Media, as: "media" },
      {
        model: db.CarAboColorMedia,
        as: "exteriorImages",
        include: [{ model: db.Media, as: "media" }],
        separate: true,
        order: [["sortOrder", "ASC"]],
      },
    ],
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

const updateColorsWithExteriorImages = async (items, carAboId, transaction) => {
  if (!Array.isArray(items)) {
    return;
  }

  const existing = await db.CarAboColor.findAll({
    where: { carAboId },
    transaction,
  });

  const existingMap = new Map(existing.map((item) => [item.id, item]));

  for (const item of items) {
    const { exteriorImages, ...colorData } = item;
    let colorRecord;

    if (colorData.id && existingMap.has(colorData.id)) {
      const { id, carAboId: _, ...data } = colorData;
      await existingMap.get(id).update(data, { transaction });
      colorRecord = existingMap.get(id);
      existingMap.delete(id);
    } else {
      const { id: _, ...data } = colorData;
      colorRecord = await db.CarAboColor.create(
        { ...data, carAboId },
        { transaction },
      );
    }

    // Replace exterior images for this color
    await db.CarAboColorMedia.destroy({
      where: { carAboColorId: colorRecord.id },
      transaction,
    });
    if (Array.isArray(exteriorImages) && exteriorImages.length) {
      await db.CarAboColorMedia.bulkCreate(
        exteriorImages.map((img, i) => ({
          carAboColorId: colorRecord.id,
          mediaId: img.mediaId,
          sortOrder: img.sortOrder ?? i,
        })),
        { transaction },
      );
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
          const colorRecords = [];
          for (const color of colors) {
            const { exteriorImages, ...colorData } = color;
            const created = await db.CarAboColor.create(
              { ...colorData, carAboId: carAbo.id },
              { transaction },
            );
            colorRecords.push({ created, exteriorImages });
          }
          // Create exterior images for each color
          for (const { created, exteriorImages } of colorRecords) {
            if (Array.isArray(exteriorImages) && exteriorImages.length) {
              await db.CarAboColorMedia.bulkCreate(
                exteriorImages.map((img, i) => ({
                  carAboColorId: created.id,
                  mediaId: img.mediaId,
                  sortOrder: img.sortOrder ?? i,
                })),
                { transaction },
              );
            }
          }
        }

        if (Array.isArray(media) && media.length) {
          await db.CarAboMedia.bulkCreate(
            media.map((m) => ({ ...m, carAboId: carAbo.id })),
            { transaction },
          );
        }

        await carAbo.reload({ include: carAboAdminIncludes, transaction });
        return carAbo;
      },
    );

    return res.status(201).json(createdCarAbo);
  } catch (error) {
    logger("error", `[createCarAbo] ${error.message}`);
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
    logger("error", `[findAllCarAbos] ${error.message}`);
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
    logger("error", `[findAllCarAboAdmin] ${error.message}`);
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
          include: [
            { model: db.Media, as: "media" },
            {
              model: db.CarAboColorMedia,
              as: "exteriorImages",
              include: [{ model: db.Media, as: "media" }],
              separate: true,
              order: [["sortOrder", "ASC"]],
            },
          ],
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

    return res.status(200).json(carAbos);
  } catch (error) {
    logger("error", `[findAvailableCarAbos] ${error.message}`);
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
    logger("error", `[findOneCarAbo] ${error.message}`);
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
          await updateColorsWithExteriorImages(colors ?? [], id, transaction);
        }

        if ("media" in req.body) {
          await updateChildren(db.CarAboMedia, media ?? [], id, transaction);
        }

        const reloaded = await db.CarAbo.findOne({
          where: { id },
          include: carAboAdminIncludes,
          transaction,
        });
        return reloaded;
      },
    );

    return res.status(200).json(updatedCarAbo);
  } catch (error) {
    logger("error", `[updateCarAbo] ${error.message} ${req.body}`);
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
    logger("error", `[deleteCarAbo] ${error.message}`);
    return res.status(500).send({ error: error.message });
  }
};

exports.calculatePrice = async (req, res) => {
  try {
    const { id } = req.params;
    const { depositValue, durationMonths, mileageKm, durationType } = req.body;

    // Validate durationType, default to 'fixed'
    const validDurationType = durationType === 'minimum' ? 'minimum' : 'fixed';

    const carAbo = await db.CarAbo.findByPk(id, {
      include: [{ model: db.CarAboPrice, as: "prices" }]
    });

    if (!carAbo) {
      return res.status(404).json({ error: "CarAbo not found" });
    }

    const selectedPrice = carAbo.prices.find(
      (p) => p.durationMonths === parseInt(durationMonths) && p.mileageKm === parseInt(mileageKm)
    );

    if (!selectedPrice) {
      return res.status(404).json({ error: "Price configuration not found" });
    }

    // Determine base price based on durationType
    const basePrice = validDurationType === 'minimum'
      ? parseFloat(selectedPrice.priceMinimumDuration)
      : parseFloat(selectedPrice.priceFixedDuration);

    const depositAmount = parseFloat(depositValue) || 0;

    // Linear formula: reduce monthly price by deposit spread over duration
    let calculatedPrice = basePrice;
    if (depositAmount > 0) {
      calculatedPrice = basePrice - ((depositAmount * 1.025) / parseInt(durationMonths));
    }
    // Ensure monthly price stays positive
    if (calculatedPrice <= 0) {
      return res.status(400).json({ error: "Die Anzahlung ist zu hoch. Der monatliche Preis muss größer als 0 € sein." });
    }

    const totalCost = calculatedPrice * parseInt(durationMonths);
    const baseTotalCost = basePrice * parseInt(durationMonths);
    const savings = baseTotalCost - (totalCost + depositAmount);

    return res.status(200).json({
      // Erst runden (Ganzzahl), dann zu String mit 2 Dezimalstellen konvertieren
      monthlyPrice: Math.round(calculatedPrice).toFixed(2),
      totalCost: Math.round(totalCost).toFixed(2),
      savings: Math.round(savings).toFixed(2),
      depositValue: Math.round(depositAmount).toFixed(2),
      durationType: validDurationType
    });
  } catch (error) {
    logger("error", `[calculatePrice] ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
};
