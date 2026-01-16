const db = require("../models");

exports.findSetting = async (req, res) => {
  try {
    const setting = await db.Setting.findOne();
    return res.status(200).json(setting);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.updateSetting = async (req, res) => {
  try {
    console.log(req.body)
    let setting = await db.Setting.findOne();

    if (!setting) {
      // create
      setting = await db.Setting.create(req.body);
      return res.status(201).json(setting);
    } else {
      // update
      await setting.update(req.body);
      return res.status(200).json(setting);
    }
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};
