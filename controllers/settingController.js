const db = require("../models");

const SETTING_PATCHABLE_FIELDS = [
  "notificationEmails",
  "pricePerKm",
  "allowedScore",
  "basicInsurancePrice",
  "premiumInsurancePrice",
  "standardDeductibleHaftpflicht",
  "standardDeductibleTeilkasko",
  "basicDeductibleHaftpflicht",
  "basicDeductibleTeilkasko",
  "premiumDeductibleHaftpflicht",
  "premiumDeductibleTeilkasko",
];

exports.findSetting = async (req, res) => {
  try {
    const setting = await db.Setting.findOne();
    return res.status(200).json(setting);
  } catch (error) {
    return res.status(500).send({ error: "Internal server error" });
  }
};

exports.findInsurance = async (req, res) => {
  try {
    const setting = await db.Setting.findOne();
    return res.status(200).json({
      basicInsurancePrice: setting.basicInsurancePrice,
      premiumInsurancePrice: setting.premiumInsurancePrice,
      standardDeductibleHaftpflicht: setting.standardDeductibleHaftpflicht,
      standardDeductibleTeilkasko: setting.standardDeductibleTeilkasko,
      basicDeductibleHaftpflicht: setting.basicDeductibleHaftpflicht,
      basicDeductibleTeilkasko: setting.basicDeductibleTeilkasko,
      premiumDeductibleHaftpflicht: setting.premiumDeductibleHaftpflicht,
      premiumDeductibleTeilkasko: setting.premiumDeductibleTeilkasko,
    });
  } catch (error) {
    return res.status(500).send({ error: "Internal server error" });
  }
};

exports.updateSetting = async (req, res) => {
  try {
    const payload = {};
    for (const key of SETTING_PATCHABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        payload[key] = req.body[key];
      }
    }

    let setting = await db.Setting.findOne();

    if (!setting) {
      setting = await db.Setting.create(payload);
      return res.status(201).json(setting);
    }
    await setting.update(payload);
    await setting.reload();
    return res.status(200).json(setting);
  } catch (error) {
    return res.status(500).send({ error: "Internal server error" });
  }
};
