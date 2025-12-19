const db = require("../models");

exports.syncCart = async (req, res) => {
  const { cartContent, userId } = req.body;
  // If cartId is provided, update, else create?
  // Or purely based on userId if logged in?
  // Or return a cartId to the frontend to store in cookie/localstorage.

  let cartId = req.body.cartId;

  try {
    let cart;
    if (cartId) {
      cart = await db.Cart.findByPk(cartId);
    }

    // Logic to merge or create
    const { carAboId, colorId, priceId, withDeposit } = cartContent;

    if (cart) {
      if (cart.completed) {
        // Create new if old is completed
        cart = await db.Cart.create({
          userId: userId || null,
          carAboId,
          colorId,
          priceId,
          withDeposit,
        });
      } else {
        // Update existing
        cart.userId = userId || cart.userId;
        cart.carAboId = carAboId;
        cart.colorId = colorId;
        cart.priceId = priceId;
        cart.withDeposit = withDeposit;
        await cart.save();
      }
    } else {
      cart = await db.Cart.create({
        userId: userId || null,
        carAboId,
        colorId,
        priceId,
        withDeposit,
      });
    }

    return res.json(cart);
  } catch (error) {
    console.error("Error syncing cart:", error);
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

    // Build response with selected items
    const response = {
      ...cart.toJSON(),
      selectedColor,
      selectedPrice,
    };

    return res.json(response);
  } catch (error) {
    console.error("Error fetching vehicle for cart:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
