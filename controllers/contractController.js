const db = require("../models");
const { logger } = require("../services/logging");
const { getGeoData } = require("../services/geoCoder");

exports.getAllContracts = async (req, res) => {
  try {
    const contracts = await db.Contract.findAll({
      include: [
        {
          model: db.User,
          include: {
            model: db.CustomerDetails,
            as: "customerDetails",
          },
        },
        {
          model: db.CarAbo,
          as: "carAbo",
        },
        {
          model: db.CarAboColor,
          as: "color",
          required: false,
        },
        {
          model: db.CarAboPrice,
          as: "price",
          required: false,
        },
      ],
    });

    res.status(201).json({
      message: "Contracts fetched Successfully",
      contracts: contracts,
    });
  } catch (e) {
    console.error("Error creating contract:", e);
    res.status(500).json({
      message: "Internal server error",
      error: e.message,
    });
  }
};

exports.createContract = async (req, res) => {
  let {
    carAboId,
    colorId,
    userId,
    customerDetails, // birthday, street, housenumber, postalCode, city, country, driversLicenseNumber, IdCardNumber, newsletter, consents
    contractData, // duration, startingDate, monthlyPrice, totalCost, insurancePackage, insuranceCosts, familyAndFriends, delivery options
    paymentData, // iban, accountHolderName, sepaMandate, score
    cartId,
  } = req.body;

  try {
    const result = await db.sequelize.transaction(async (transaction) => {
      if (!userId) {
        logger(
          "error",
          "Creating Contract lasted in Error because of missing userID"
        );
        res.status(400).json({
          message: "No UserId Provided. Please try again",
        });
      }

      // 1. Create or Update CustomerDetails
      let details = await db.CustomerDetails.findOne({
        where: { userId },
        transaction,
      });

      const detailsPayload = {
        userId,
        birthday: customerDetails.birthday,
        street: customerDetails.street,
        housenumber: customerDetails.housenumber,
        postalCode: customerDetails.postalCode,
        city: customerDetails.city,
        country: customerDetails.country || "Deutschland",
        newsletter: customerDetails.newsletter || false,
        allowsCreditworthyCheck:
          customerDetails.allowsCreditworthyCheck || true,
        allowedToPurchase: customerDetails.allowedToPurchase || true,
        acceptPrivacyPolicy: customerDetails.acceptPrivacyPolicy || true,
        driversLicenseNumber: customerDetails.driversLicenseNumber,
        IdCardNumber: customerDetails.IdCardNumber,
      };

      if (details) {
        await details.update(detailsPayload, { transaction });
      } else {
        await db.CustomerDetails.create(detailsPayload, { transaction });
      }

      // Also update User basic info if provided
      if (
        customerDetails.firstName ||
        customerDetails.lastName ||
        customerDetails.phone
      ) {
        const userUpdatePayload = {};
        if (customerDetails.firstName)
          userUpdatePayload.firstName = customerDetails.firstName;
        if (customerDetails.lastName)
          userUpdatePayload.lastName = customerDetails.lastName;
        if (customerDetails.phone)
          userUpdatePayload.phone = customerDetails.phone;

        await db.User.update(userUpdatePayload, {
          where: { id: userId },
          transaction,
        });
      }

      //get Lat Lng
      const address = `${detailsPayload.street} ${detailsPayload.houseNumber}, ${detailsPayload.postalCode} ${detailsPayload.city}`;
      const { lat, lon } = await getGeoData(address);

      // 2. Create Contract

      //2.1 Create duration, monthlyPrice and totalcosts
      const Cart = await db.Cart.findOne({
        where: { id: cartId },
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

      let selectedPrice = null;

      if (Cart.priceId && Cart.car && Cart.car.prices) {
        selectedPrice = Cart.car.prices.find(
          (price) => price.id === Cart.priceId
        );
      }

      const duration = selectedPrice.durationMonths;
      const monthlyPrice = Cart.withDeposit
        ? selectedPrice.priceWithDeposit
        : selectedPrice.priceNoDeposit;
      const totalCost = duration * monthlyPrice;

      const contract = await db.Contract.create(
        {
          userId,
          duration: contractData.duration,
          monthlyPrice: contractData.monthlyPrice,
          totalCost: contractData.totalCost,
          startingDate: contractData.startingDate,
          insurancePackage: contractData.insurancePackage || false,
          insuranceCosts: contractData.insuranceCosts || 0,
          familyAndFriends: contractData.familyAndFriends || false,
          familyAndFriendsCosts: contractData.familyAndFriendsCosts || 0,
          familyAndFriendsMembers: contractData.familyAndFriendsMembers || [],
          // Delivery
          wantsDelivery: contractData.wantsDelivery || false,
          deliveryCosts: contractData.deliveryCosts || 0,
          differentDeliveryAdress:
            contractData.differentDeliveryAdress || false,
          deliveryStreet: contractData.deliveryStreet || null,
          deliveryHousenumber: contractData.deliveryHousenumber || null,
          deliveryPostalCode: contractData.deliveryPostalCode || null,
          deliveryCountry: contractData.deliveryCountry || null,
          deliveryNote: contractData.deliveryNote || null,
          // Payment
          accountHolderName: paymentData.accountHolderName,
          iban: paymentData.iban,
          sepaMandate: paymentData.sepaMandate || false,
          sepaMandateDate: paymentData.sepaMandate ? new Date() : null,
          score: paymentData.score || null,
          // Status
          oderStatus: "started",
          duration: duration,
          monthlyPrice: monthlyPrice,
          totalCost: totalCost,
          orderCompleted: false,
          carAboId: Cart.carAboId,
          colorId: Cart.colorId,
          priceId: Cart.priceId,
          withDeposit: Cart.withDeposit,
          lat: lat,
          lng: lon,
        },
        { transaction }
      );

      // 3. Link CarAbo to Contract
      await contract.setCarAbo(carAboId, { transaction });
      await db.CarAbo.update(
        { ContractId: contract.id, status: "reserved" },
        { where: { id: carAboId }, transaction }
      );

      // 4. Update Color Variant Stock
      if (colorId) {
        await db.CarAboColor.update(
          { isOrdered: true },
          { where: { id: colorId }, transaction }
        );
      }

      // 5. Mark Cart as Completed
      if (cartId) {
        await db.Cart.update(
          { completed: true },
          { where: { id: cartId }, transaction }
        );
      }

      return contract;
    });

    res.status(201).json({
      message: "Contract created successfully",
      contractId: result.id,
    });
  } catch (error) {
    console.error("Error creating contract:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.deleteContract = async (req, res) => {
  const id = req.params.id;
  try {
    let deletedContract = await db.Contract.destroy({ where: { id } });
    res.status(201).json({
      message: "Contract deleted successfully",
      deletedContractId: id,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
