"use strict";

const { Op } = require("sequelize");
const { Contract, User, CustomerDetails } = require("../../models");

const REDACTED = "[ANONYMIZED]";

function parseDays(value, fallback = 30) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cutoffDateFromDays(days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

function applyContractAnonymization(contract) {
  // Delivery / address
  contract.deliveryStreet = REDACTED;
  contract.deliveryHousenumber = REDACTED;
  contract.deliveryPostalCode = REDACTED;
  contract.deliveryCountry = REDACTED;
  contract.deliveryNote = null;

  // Payment / identity
  contract.accountHolderName = REDACTED;
  contract.iban = REDACTED;
  contract.mandateReference = null;
  contract.score = null;

  // Signature / token metadata
  contract.signatureIp = null;
  contract.signatureUserAgent = null;
  contract.signatureFullName = REDACTED;
  contract.signTokenHash = null;
  contract.shareTokenHash = null;

  // Location details
  contract.lat = null;
  contract.lng = null;
  contract.pickupLocationLat = null;
  contract.pickupLocationLng = null;

  // Family & friends data
  contract.familyAndFriends = false;
  contract.familyAndFriendsCosts = null;
  contract.familyAndFriendsMembers = null;

  // Keep userId for historical assignment/reporting
  contract.completedBy = null;
}

function applyUserAnonymization(user) {
  if (!user) return;
  user.phone = REDACTED;
}

function applyCustomerDetailsAnonymization(customerDetails) {
  if (!customerDetails) return;

  customerDetails.street = REDACTED;
  customerDetails.housenumber = REDACTED;
  customerDetails.postalCode = REDACTED;
  customerDetails.city = REDACTED;
  customerDetails.country = REDACTED;
  customerDetails.birthday = new Date("1970-01-01T00:00:00.000Z");
  customerDetails.driversLicenseNumber = REDACTED;
  customerDetails.IdCardNumber = REDACTED;
  customerDetails.allowedLicenseClasses = REDACTED;
  customerDetails.licenseValidUntil = new Date("1970-01-01T00:00:00.000Z");
  customerDetails.licenseIssuingPlace = REDACTED;
  customerDetails.licenseIssuedOn = new Date("1970-01-01T00:00:00.000Z");
  customerDetails.placeOfBirth = REDACTED;
}

async function anonymizeOldOrders({ days } = {}) {
  const thresholdDays = parseDays(
    days ?? process.env.ANONYMIZE_ORDERS_AFTER_DAYS,
    30,
  );
  const cutoffDate = cutoffDateFromDays(thresholdDays);

  const candidates = await Contract.findAll({
    where: {
      createdAt: { [Op.lte]: cutoffDate },
      [Op.or]: [{ orderCompleted: true }, { oderStatus: "completed" }],
    },
    include: [
      {
        model: User,
        include: [{ model: CustomerDetails, as: "customerDetails" }],
      },
    ],
  });

  let anonymizedCount = 0;
  for (const contract of candidates) {
    applyContractAnonymization(contract);
    applyUserAnonymization(contract.User);
    applyCustomerDetailsAnonymization(contract.User?.customerDetails);
    await contract.User?.save();
    await contract.User?.customerDetails?.save();
    await contract.save();
    anonymizedCount += 1;
  }

  return {
    thresholdDays,
    cutoffDate,
    checkedCount: candidates.length,
    anonymizedCount,
  };
}

module.exports = { anonymizeOldOrders };
