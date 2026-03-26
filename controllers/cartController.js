const db = require("../models");
const { logger } = require("../services/logging");

exports.syncCart = async (req, res) => {
  const { cartContent, userId } = req.body;

  let cartId = req.body.cartId;

  try {
    let cart;
    if (cartId) {
      cart = await db.Cart.findByPk(cartId);
    }

    // Logic to merge or create
    let { carAboId, colorId, priceId, durationType, depositValue, calculatedMonthlyPrice } = cartContent;

    // Validate durationType
    const validDurationType = durationType === 'minimum' ? 'minimum' : 'fixed';

    //check if the calculatedMonthlyPrice from the client is correct
    const carAbo = await db.CarAbo.findByPk(carAboId, {
      include: [{
        model: db.CarAboPrice, as: "prices",
        where: {
          id: priceId,
        }
      }]
    });

    const selectedPrice = carAbo.prices[0];

    // Determine base price based on durationType
    const basePrice = validDurationType === 'minimum'
      ? parseFloat(selectedPrice.priceMinimumDuration)
      : parseFloat(selectedPrice.priceFixedDuration);

    const depositAmount = parseFloat(depositValue) || 0;

    // Linear formula: reduce monthly price by deposit spread over duration
    let calculatedPrice = basePrice;
    if (depositAmount > 0) {
      calculatedPrice = basePrice - ((depositAmount * 1.025) / parseInt(selectedPrice.durationMonths));
    }

    // Ensure monthly price stays positive
    if (calculatedPrice <= 0) {
      return res.status(400).json({ error: "Die Anzahlung ist zu hoch. Der monatliche Preis muss größer als 0 € sein." });
    }

    calculatedPrice = Math.round(parseFloat(calculatedPrice.toFixed(2)));

    if (calculatedMonthlyPrice !== calculatedPrice) {
      calculatedMonthlyPrice = calculatedPrice;
    }

    if (cart) {
      if (cart.completed) {
        // Create new if old is completed
        cart = await db.Cart.create({
          userId: userId || null,
          carAboId,
          colorId,
          priceId,
          durationType: validDurationType,
          depositValue,
          calculatedMonthlyPrice,
        });
      } else {
        // Update existing
        cart.userId = userId || cart.userId;
        cart.carAboId = carAboId;
        cart.colorId = colorId;
        cart.priceId = priceId;
        cart.durationType = validDurationType;
        cart.depositValue = depositValue;
        cart.calculatedMonthlyPrice = calculatedMonthlyPrice;
        await cart.save();
      }
    } else {
      cart = await db.Cart.create({
        userId: userId || null,
        carAboId,
        colorId,
        priceId,
        durationType: validDurationType,
        depositValue,
        calculatedMonthlyPrice,
      });
    }

    return res.json(cart);
  } catch (error) {
    console.error("Error syncing cart:", error);
    logger("error", `[syncCart] ${error.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getCart = async (req, res) => {
  try {
    const { id } = req.params;
    const cart = await db.Cart.findOne({
      where: { id },
      include: [
        {
          model: db.CarAbo,
          as: "car",
          include: [
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
          ],
        },
      ],
    });

    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    // Find the selected color and price
    let selectedColor = null;
    let selectedPrice = null;

    if (cart.colorId && cart.car && cart.car.colors) {
      selectedColor = cart.car.colors.find(color => color.id === cart.colorId);
    }

    if (cart.priceId && cart.car && cart.car.prices) {
      selectedPrice = cart.car.prices.find(price => price.id === cart.priceId);
    }

    // Look up associated contract (for completed carts / confirmation page)
    let contract = null;
    if (cart.completed) {
      contract = await db.Contract.findOne({
        where: {
          carAboId: cart.carAboId,
          colorId: cart.colorId,
          priceId: cart.priceId,
          userId: cart.userId,
        },
        attributes: ["monthlyPrice", "insuranceType", "insuranceCosts", "insurancePackage", "deliveryCosts", "depositValue"],
        order: [['createdAt', 'DESC']],
      });
    }
    // Build response with selected items
    const response = {
      ...cart.toJSON(),
      selectedColor,
      selectedPrice,
      contract: contract ? contract.toJSON() : null,
    };

    return res.json(response);
  } catch (error) {
    console.error("Error fetching vehicle for cart:", error);
    logger("error", `[getCart] ${error.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
