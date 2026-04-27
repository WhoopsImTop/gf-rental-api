const sequelize = require("sequelize");
const db = require("../../models");

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

exports.createReview = async (req, res) => {
  try {
    if (!req.body.rating || !req.body.review || !req.body.email) {
      return res.status(501).json({
        error: true,
        message: "Bitte füllen Sie alle benötigten Felder aus.",
      });
    }

    //validate email
    if (!isValidEmail(req.body.email)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    const reviews = await db.Review.create(req.body);
    return res.status(201).json(reviews);
  } catch (error) {
    return res.status(500).json({ error: "An unexpected error occurred" });
  }
};

exports.findAllReviews = async (req, res) => {
  try {
    const reviews = await db.Review.findAll({
      attributes: ["id", "rating", "review", "createdAt"],
    });
    return res.status(200).json(reviews);
  } catch (error) {
    return res.status(500).send({ error: "An unexpected error occurred" });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.Review.destroy({
      where: { id: id },
    });
    if (deleted) {
      return res.status(204).send("Review wurde gelöscht");
    } else {
      throw new Error("Review wurde nicht gefunden");
    }
  } catch (error) {
    return res.status(500).send({ error: "An unexpected error occurred" });
  }
};
