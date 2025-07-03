const sequelize = require("sequelize");
const db = require("../models");

exports.createCarsharingCar = async (req, res) => {
  try {
    const carsharingCar = await db.CarsharingCar.create(req.body);
    //relate each id in images array to the carsharingCar
    if (req.body.images && req.body.images.length > 0) {
      const images = await db.Media.findAll({
        where: {
          id: {
            [sequelize.Op.in]: req.body.images,
          },
        },
      });
      // Associate images with the carsharingCar
      await carsharingCar.setImages(images);
    }
    return res.status(201).json(carsharingCar);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.findAllCarsharingCars = async (req, res) => {
  try {
    const carsharingCars = await db.CarsharingCar.findAll({
      include: [
        {
          model: db.Media,
          as: "images",
          through: { attributes: [] }, // Exclude junction table attributes
        },
      ],
    });
    return res.status(200).json(carsharingCars);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.findOneCarsharingCar = async (req, res) => {
  try {
    const { id } = req.params;
    const carsharingCar = await db.CarsharingCar.findOne({
      where: { id: id },
      include: [
        {
          model: db.Media,
          as: "images",
          through: { attributes: [] }, // Exclude junction table attributes
        },
      ],
    });
    if (carsharingCar) {
      return res.status(200).json(carsharingCar);
    } else {
      return res
        .status(404)
        .send("CarsharingCar with the specified ID does not exist");
    }
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.updateCarsharingCar = async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.CarsharingCar.update(req.body, {
      where: { id },
    });

    const carsharingCar = await db.CarsharingCar.findByPk(id);

    // Alle Verknüpfungen löschen
    await carsharingCar.setImages([]);

    if (req.body.images && req.body.images.length > 0) {
      for (let i = 0; i < req.body.images.length; i++) {
        const imageId = req.body.images[i];
        const image = await db.Media.findByPk(imageId);
        if (image) {
          // Reihenfolge beim Verknüpfen mitgeben
          await carsharingCar.addImage(image, { through: { order: i } });
        }
      }
    }

    if (updated) {
      const updatedCarsharingCar = await db.CarsharingCar.findOne({
        where: { id },
        include: [
          {
            model: db.Media,
            as: "images",
            through: { attributes: ["order"] },
          },
        ],
        order: [
          [
            { model: db.Media, as: "images" },
            "CarsharingCarsImages",
            "order",
            "ASC",
          ],
        ],
      });

      return res.status(200).json(updatedCarsharingCar);
    } else {
      throw new Error("CarsharingCar not found");
    }
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.deleteCarsharingCar = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.CarsharingCar.destroy({
      where: { id: id },
    });
    if (deleted) {
      return res.status(204).send("CarsharingCar deleted");
    } else {
      throw new Error("CarsharingCar not found");
    }
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.addImageToCarsharingCar = async (req, res) => {
  try {
    const { carId, mediaId } = req.body;

    // Check if car exists
    const car = await db.CarsharingCar.findByPk(carId);
    if (!car) {
      return res.status(404).json({ error: "CarsharingCar not found" });
    }

    // Check if media exists
    const media = await db.Media.findByPk(mediaId);
    if (!media) {
      return res.status(404).json({ error: "Media not found" });
    }

    // Add association
    await car.addImages(media);

    return res
      .status(200)
      .json({ message: "Image added to CarsharingCar successfully" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.removeImageFromCarsharingCar = async (req, res) => {
  try {
    const { carId, mediaId } = req.params;

    // Check if car exists
    const car = await db.CarsharingCar.findByPk(carId);
    if (!car) {
      return res.status(404).json({ error: "CarsharingCar not found" });
    }

    // Check if media exists
    const media = await db.Media.findByPk(mediaId);
    if (!media) {
      return res.status(404).json({ error: "Media not found" });
    }

    // Remove association
    await car.removeImages(media);

    return res
      .status(200)
      .json({ message: "Image removed from CarsharingCar successfully" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
