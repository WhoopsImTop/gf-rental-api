const db = require("../../models");
const { getGeoData } = require("../../services/geoCoder");

exports.createCustomer = async (req, res) => {
  try {
    const body = req.body;

    //check if customer already exists by companyName, email, street, houseNumber, postalCode, city
    const existingCustomer = await db.CrmCustomer.findOne({
      where: {
        companyName: body.companyName,
      },
    });
    if (existingCustomer) {
      return res.status(400).json({ message: "Customer already exists" });
    }

    // Geocode the address
    const { street, houseNumber, postalCode, city } = body;
    const address = `${street} ${houseNumber}, ${postalCode} ${city}`;
    const { lat, lng } = await getGeoData(address);
    body.lat = lat;
    body.lng = lng;
    const customer = await db.CrmCustomer.create(body);

    //associate customer with user
    await customer.addUser(req.user.id);

    return res.status(201).json(customer);
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message, line: error.lineNumber });
  }
};

exports.findAllCustomers = async (req, res) => {
  try {
    const customers = await db.CrmCustomer.findAll({
      include: [
        {
          model: db.CrmActionHistory,
          model: db.CrmStatuses,
          model: db.User,
        },
      ],
    });
    return res.status(200).json(customers);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.findOneCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await db.CrmCustomer.findOne({
      where: { id: id },
      include: [
        {
          model: db.CrmActionHistory,
        },
        {
          model: db.CrmStatuses,
        },
        {
          model: db.User,
          through: { attributes: [] },
        },
      ],
    });
    if (customer) {
      return res.status(200).json(customer);
    } else {
      return res
        .status(404)
        .send("Customer with the specified ID does not exist");
    }
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // Hole die aktuellen Daten aus der Datenbank
    const customer = await db.CrmCustomer.findOne({ where: { id } });
    if (!customer) {
      throw new Error("Customer not found");
    }
    // Kombiniere die bestehenden Daten mit den neuen
    const updatedData = { ...customer.toJSON(), ...req.body };

    //check if address has changed
    const addressChanged =
      updatedData.street !== customer.street ||
      updatedData.houseNumber !== customer.houseNumber ||
      updatedData.postalCode !== customer.postalCode ||
      updatedData.city !== customer.city;

    if (addressChanged) {
      const address = `${updatedData.street} ${updatedData.houseNumber}, ${updatedData.postalCode} ${updatedData.city}`;
      const { lat, lng } = await getGeoData(address);
      updatedData.lat = lat;
      updatedData.lng;
    }

    // Aktualisiere die Daten
    const [updated] = await db.CrmCustomer.update(updatedData, {
      where: { id },
    });

    if (updated) {
      const updatedCustomer = await db.CrmCustomer.findOne({ where: { id } });
      return res.status(200).json(updatedCustomer);
    } else {
      throw new Error("Update failed");
    }
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.setCustomerAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comment } = req.body;
    const userId = req.user.id;

    const customer = await db.CrmCustomer.findOne({ where: { id } });
    if (!customer) {
      throw new Error("Customer not found");
    }

    const statusMessages = [
      {
        status: "Änderung",
        titlePlaceHolder: "{{Vorname}} {{Nachname}} hat daten aktualisiert",
      },
      {
        status: "Löschung",
        titlePlaceHolder: "{{Vorname}} {{Nachname}} wurde gelöscht",
      },
      {
        status: "Anruf",
        titlePlaceHolder: "{{Vorname}} {{Nachname}} wurde angerufen",
      },
      {
        status: "E-Mail",
        titlePlaceHolder: "{{Vorname}} {{Nachname}} wurde eine E-Mail gesendet",
      },
      {
        status: "Brief",
        titlePlaceHolder: "{{Vorname}} {{Nachname}} wurde ein Brief gesendet",
      },
      {
        status: "Aktion",
        titlePlaceHolder:
          "{{Vorname}} {{Nachname}} wurde eine Aktion durchgeführt",
      },
    ];

    let title = statusMessages.find(
      (message) => message.status === action
    ).titlePlaceHolder;

    //replace placeholders with customer data
    title = title
      .replace("{{Vorname}}", req.user.firstName)
      .replace("{{Nachname}}", req.user.lastName);

    const actionHistory = await db.CrmActionHistory.create({
      crmCustomerId: id,
      action,
      title,
      comment,
      userId,
    });

    return res.status(201).json(actionHistory);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.assignUserToCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const customer = await db.CrmCustomer.findOne({ where: { id } });
    if (!customer) {
      throw new Error("Customer not found");
    }

    const user = await db.User.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error("User not found");
    }

    await customer.addUser(user);

    return res.status(200).json(customer);
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.CrmCustomer.destroy({
      where: { id: id },
    });
    if (deleted) {
      return res.status(204).send("Customer deleted");
    }
    throw new Error("Customer not found");
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
};
