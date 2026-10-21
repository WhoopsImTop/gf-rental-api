"use strict";

const SIX_DIGIT_CODE = /^\d{6}$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * OTP- und Reset-Codes muessen ein String aus genau 6 Ziffern sein.
 * Arrays/Objekte wuerden von Sequelize sonst zu `IN (...)`/Operatoren.
 */
function isSixDigitCode(value) {
  return typeof value === "string" && SIX_DIGIT_CODE.test(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidNewPassword(value) {
  return typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH;
}

module.exports = {
  isSixDigitCode,
  isNonEmptyString,
  isValidNewPassword,
  MIN_PASSWORD_LENGTH,
};
