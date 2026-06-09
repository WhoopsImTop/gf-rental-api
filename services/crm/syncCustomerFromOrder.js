const db = require("../../models");
const { getGeoData } = require("../geoCoder");

async function syncCustomerFromOrder({ user, customerDetails, transaction }) {
  const companyName =
    typeof customerDetails?.companyName === "string"
      ? customerDetails.companyName.trim()
      : "";

  if (!companyName) {
    return null;
  }

  let customer = await db.CrmCustomer.findOne({
    where: { companyName },
    transaction,
  });

  const street = customerDetails.street || "";
  const houseNumber = String(customerDetails.housenumber || "");
  const postalCode = String(customerDetails.postalCode || "");
  const city = customerDetails.city || "";
  const country = customerDetails.country || "Deutschland";

  let lat = null;
  let lng = null;
  if (street && houseNumber && postalCode && city) {
    const address = `${street} ${houseNumber}, ${postalCode} ${city}`;
    const geoData = await getGeoData(address);
    lat = geoData?.lat ?? null;
    lng = geoData?.lng ?? null;
  }

  const payload = {
    customerType: "Firmenkunde",
    companyName,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    email: user.email || "",
    phone: user.phone || "",
    street,
    houseNumber,
    postalCode,
    city,
    country,
    lat,
    lng,
    salutation: "Keine Angabe",
    sellingStrategy: "Offen",
    priority: "low",
    preferredContactMethod: "Email",
    marketingOptIn: Boolean(customerDetails.newsletter),
  };

  if (!customer) {
    customer = await db.CrmCustomer.create(payload, { transaction });
    const status = await db.CrmStatuses.findOne({
      where: { iconName: "new" },
      transaction,
    });
    if (status) {
      await customer.setStatus(status, { transaction });
    }
  } else {
    await customer.update(
      {
        customerType: "Firmenkunde",
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        street: payload.street,
        houseNumber: payload.houseNumber,
        postalCode: payload.postalCode,
        city: payload.city,
        country: payload.country,
        lat: payload.lat,
        lng: payload.lng,
      },
      { transaction },
    );
  }

  const existingUsers = await customer.getUsers({ transaction });
  const alreadyLinked = existingUsers.some((linkedUser) => linkedUser.id === user.id);
  if (!alreadyLinked) {
    await customer.addUser(user, { transaction });
  }

  return customer;
}

module.exports = {
  syncCustomerFromOrder,
};
