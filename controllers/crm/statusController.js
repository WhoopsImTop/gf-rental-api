const db = require("../../models");

exports.createStatus = async (req, res) => {
  try {
    if(!req.file){
      return res.status(400).send("Please upload a file!");
    }
    //create Media Object in DB
    const media = await db.Media.create({
        name: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        url: process.env.APPURL + "/public/uploads/" + req.file.filename,
    });
    //create CrmStatus Object in DB
    const status = await db.CrmStatuses.create(req.body);
    //set statusId in Media Object
    media.statusId = status.id;
    await media.save();
    return res.status(201).json(status);
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message, line: error.lineNumber });
  }
};

exports.findAllStatuses = async (req, res) => {
  try {
    const statuses = await db.CrmStatuses.findAll({
      include: [
        {
          model: db.Media,
          attributes: ["id", "name", "fileSize", "fileType", "url"],
          as: "media",
        },
      ],
    });
    return res.status(200).json(statuses);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.findOneStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = await db.CrmStatuses.findOne({
      where: { id: id },
      include: [
        {
          model: db.Media,
        },
      ],
    });
    if (status) {
      return res.status(200).json(status);
    } else {
      return res
        .status(404)
        .send("Status with the specified ID does not exist");
    }
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = await db.CrmStatuses.findOne({ where: { id: id } });
    if (status) {
      await status.update(req.body);
      return res.status(200).json(status);
    } else {
      return res
        .status(404)
        .send("Status with the specified ID does not exist");
    }
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.deleteStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = await db.CrmStatuses.findOne({ where: { id: id } });
    if (status) {
      await status.destroy();
      return res.status(204).send();
    } else {
      return res
        .status(404)
        .send("Status with the specified ID does not exist");
    }
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};
