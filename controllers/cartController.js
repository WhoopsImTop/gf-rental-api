const db = require("../models");
const { logger } = require("../services/logging");
const { logSecurityEvent } = require("../services/audit/securityAudit");
const { normalizeCartAccessToken } = require("../utils/cartAccessToken");
const DEPOSIT_STEP = 50;
const MAX_DEPOSIT_CAP = 5000;
const DEPOSIT_FEE_FACTOR = 1.025;
const MIN_DEPOSIT = 500;

const floorToDepositStep = (value) =>
  Math.floor(value / DEPOSIT_STEP) * DEPOSIT_STEP;

const normalizeDepositAmount = (
  rawDepositValue,
  maxAllowedDeposit,
  minAllowedDeposit = 0,
) => {
  const parsed = parseFloat(rawDepositValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  const clamped = Math.min(
    Math.max(parsed, minAllowedDeposit),
    maxAllowedDeposit,
  );
  return Math.round(clamped / DEPOSIT_STEP) * DEPOSIT_STEP;
};

/** Strip internal identifiers from API JSON (public cart). */
function publicCartJson(cart) {
  const j = cart.toJSON ? cart.toJSON() : { ...cart };
  delete j.id;
  delete j.userId;
  return j;
}

exports.syncCart = async (req, res) => {
  const { cartContent } = req.body;
  const accessTokenIn = normalizeCartAccessToken(req.body.accessToken);

  try {
    let cart = null;
    if (accessTokenIn) {
      cart = await db.Cart.findOne({ where: { accessToken: accessTokenIn } });
      if (!cart) {
        logSecurityEvent({
          req,
          action: "cart_sync",
          outcome: "token_not_found",
          accessToken: accessTokenIn,
        });
        return res.status(404).json({
          message:
            "Der Warenkorb wurde nicht gefunden. Bitte konfiguriere dein Fahrzeug erneut.",
        });
      }
      if (cart.completed) {
        cart = null;
      }
    }

    let {
      carAboId,
      colorId,
      priceId,
      durationType,
      depositValue,
      calculatedMonthlyPrice,
    } = cartContent || {};

    if (!carAboId || !priceId) {
      return res.status(400).json({
        message:
          "Fahrzeug oder Preis fehlt. Bitte schließe die Konfiguration erneut ab.",
      });
    }

    const validDurationType = durationType === "minimum" ? "minimum" : "fixed";

    const carAbo = await db.CarAbo.findByPk(carAboId, {
      include: [
        {
          model: db.CarAboPrice,
          as: "prices",
          where: {
            id: priceId,
          },
          required: false,
        },
      ],
    });

    if (!carAbo) {
      return res.status(400).json({
        message:
          "Das gewählte Fahrzeug wurde nicht gefunden. Bitte wähle es erneut aus.",
      });
    }

    const selectedPrice =
      carAbo.prices && carAbo.prices.length > 0 ? carAbo.prices[0] : null;

    if (!selectedPrice) {
      return res.status(400).json({
        message:
          "Die gewählte Preiskombination ist nicht mehr gültig. Bitte konfiguriere das Fahrzeug erneut.",
      });
    }

    const basePrice =
      validDurationType === "minimum"
        ? parseFloat(selectedPrice.priceMinimumDuration)
        : parseFloat(selectedPrice.priceFixedDuration);
    const durationMonthsInt = parseInt(selectedPrice.durationMonths, 10);
    if (
      !Number.isFinite(basePrice) ||
      basePrice <= 0 ||
      !Number.isInteger(durationMonthsInt) ||
      durationMonthsInt <= 0
    ) {
      return res.status(400).json({
        message: "Ungültige Preisdaten. Bitte konfiguriere das Fahrzeug erneut.",
      });
    }

    const maxDepositByPrice =
      (basePrice * durationMonthsInt - 0.01) / DEPOSIT_FEE_FACTOR;
    const clampedDepositLimit = Math.min(maxDepositByPrice, MAX_DEPOSIT_CAP);
    const maxAllowedDeposit = Math.max(
      0,
      floorToDepositStep(clampedDepositLimit),
    );
    const effectiveMinDeposit = Math.min(MIN_DEPOSIT, maxAllowedDeposit);
    const depositAmount = normalizeDepositAmount(
      depositValue,
      maxAllowedDeposit,
      effectiveMinDeposit,
    );
    depositValue = depositAmount;

    let calculatedPrice = basePrice;
    if (depositAmount > 0) {
      calculatedPrice =
        basePrice - (depositAmount * 1.025) / durationMonthsInt;
    }

    if (calculatedPrice <= 0) {
      return res.status(400).json({
        message:
          "Die Anzahlung ist zu hoch. Der monatliche Preis muss größer als 0 € sein.",
        error:
          "Die Anzahlung ist zu hoch. Der monatliche Preis muss größer als 0 € sein.",
      });
    }

    calculatedPrice = Math.round(parseFloat(calculatedPrice.toFixed(2)));

    if (calculatedMonthlyPrice !== calculatedPrice) {
      calculatedMonthlyPrice = calculatedPrice;
    }

    if (cart) {
      cart.carAboId = carAboId;
      cart.colorId = colorId;
      cart.priceId = priceId;
      cart.durationType = validDurationType;
      cart.depositValue = depositValue;
      cart.calculatedMonthlyPrice = calculatedMonthlyPrice;
      await cart.save();
      logSecurityEvent({
        req,
        action: "cart_sync",
        outcome: "updated",
        accessToken: cart.accessToken,
      });
    } else {
      cart = await db.Cart.create({
        carAboId,
        colorId,
        priceId,
        durationType: validDurationType,
        depositValue,
        calculatedMonthlyPrice,
      });
      logSecurityEvent({
        req,
        action: "cart_sync",
        outcome: "created",
        accessToken: cart.accessToken,
      });
    }

    return res.json(publicCartJson(cart));
  } catch (error) {
    logger("error", `[syncCart] ${error.message}`);
    logSecurityEvent({
      req,
      action: "cart_sync",
      outcome: "error",
      extra: { message: error.message },
    });
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.updateCustomerType = async (req, res) => {
  try {
    const accessToken = normalizeCartAccessToken(req.params.accessToken);
    if (!accessToken) {
      return res.status(404).json({
        message:
          "Der Warenkorb wurde nicht gefunden. Bitte konfiguriere dein Fahrzeug erneut.",
      });
    }

    const { customerType } = req.body || {};
    if (customerType !== "private" && customerType !== "business") {
      return res.status(400).json({
        message: "Ungültiger Kundentyp. Erlaubt sind 'private' und 'business'.",
      });
    }

    const cart = await db.Cart.findOne({ where: { accessToken } });
    if (!cart) {
      return res.status(404).json({
        message:
          "Der Warenkorb wurde nicht gefunden. Bitte konfiguriere dein Fahrzeug erneut.",
      });
    }

    if (cart.completed) {
      return res.status(409).json({
        message: "Dieser Warenkorb ist bereits abgeschlossen.",
      });
    }

    cart.customerType = customerType;
    await cart.save();

    logSecurityEvent({
      req,
      action: "cart_customer_type",
      outcome: "updated",
      accessToken: cart.accessToken,
      extra: { customerType },
    });

    return res.json({
      accessToken: cart.accessToken,
      customerType: cart.customerType,
    });
  } catch (error) {
    logger("error", `[updateCustomerType] ${error.message}`);
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.getCart = async (req, res) => {
  try {
    const accessToken = normalizeCartAccessToken(req.params.accessToken);
    if (!accessToken) {
      return res.status(404).json({
        message:
          "Der Warenkorb wurde nicht gefunden. Bitte konfiguriere dein Fahrzeug erneut.",
        error: "Cart not found",
      });
    }

    const cart = await db.Cart.findOne({
      where: { accessToken },
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
      return res.status(404).json({
        message:
          "Der Warenkorb wurde nicht gefunden. Bitte konfiguriere dein Fahrzeug erneut.",
        error: "Cart not found",
      });
    }

    let selectedColor = null;
    let selectedPrice = null;

    if (cart.colorId && cart.car && cart.car.colors) {
      selectedColor = cart.car.colors.find(
        (color) => color.id === cart.colorId,
      );
    }

    if (cart.priceId && cart.car && cart.car.prices) {
      selectedPrice = cart.car.prices.find(
        (price) => price.id === cart.priceId,
      );
    }

    let contract = null;
    if (cart.completed) {
      contract = await db.Contract.findOne({
        where: {
          carAboId: cart.carAboId,
          colorId: cart.colorId,
          priceId: cart.priceId,
          userId: cart.userId,
        },
        attributes: [
          "monthlyPrice",
          "insuranceType",
          "insuranceCosts",
          "insurancePackage",
          "deliveryCosts",
          "depositValue",
        ],
        order: [["createdAt", "DESC"]],
      });
    }

    const base = publicCartJson(cart);
    const response = {
      ...base,
      accessToken: cart.accessToken,
      hasVerifiedUser: Boolean(cart.userId),
      selectedColor,
      selectedPrice,
      contract: contract ? contract.toJSON() : null,
    };

    logSecurityEvent({
      req,
      action: "cart_get",
      outcome: "ok",
      accessToken: cart.accessToken,
    });

    return res.json(response);
  } catch (error) {
    console.error("Error fetching vehicle for cart:", error);
    logger("error", `[getCart] ${error.message}`);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
