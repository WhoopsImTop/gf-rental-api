const db = require("../models");

exports.findAllSellers = async (req, res) => {
  try {
    const sellers = await db.Seller.findAll();
    return res.status(200).json(sellers);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.createSeller = async (req, res) => {
  try {
    const seller = await db.Seller.create(req.body);
    return res.status(201).json(seller);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};
