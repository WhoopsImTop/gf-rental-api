const db = require("../models");

exports.findAllBrands = async (req, res) => {
  try {
    const brands = await db.Brand.findAll();
    return res.status(200).json(brands);
  } catch (error) {
    return res.status(500).send({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.createBrand = async (req, res) => {
  try {
    const brand = await db.Brand.create(req.body);
    return res.status(201).json(brand);
  } catch (error) {
    return res.status(500).send({ error: "Es ist ein Fehler aufgetreten" });
  }
};
