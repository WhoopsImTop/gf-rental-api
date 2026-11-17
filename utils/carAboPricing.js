"use strict";

// Gemeinsame Preislogik für Auto Abos: Matrixpreis (Laufzeit × Kilometer)
// plus monatlicher Aufpreis der gewählten Farbe.

const parseMoney = (value) => {
  if (value === "" || value == null) return NaN;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  return Number.parseFloat(normalized);
};

/** Aufpreis einer Farbe in Euro; ungültige oder negative Werte zählen als 0. */
const getColorSurcharge = (color) => {
  const parsed = parseMoney(color?.priceSurcharge);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100) / 100;
};

/**
 * Aufpreise sind nur in ganzen Euro erlaubt, weil die Monatsrate auf ganze
 * Euro gerundet wird (sonst 446,50 € auf der Fahrzeugseite, 447 € im Vertrag).
 * Leer, 0 oder ungültig gilt als "kein Aufpreis" und ist erlaubt.
 */
const isWholeEuroSurcharge = (value) => {
  const parsed = parseMoney(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return true;
  return Number.isInteger(Math.round(parsed * 100) / 100);
};

/** Preis aus der Matrix je Laufzeitmodell; NaN, wenn nicht gesetzt oder <= 0. */
const getMatrixPrice = (price, durationType) => {
  if (!price) return NaN;
  const raw =
    durationType === "minimum"
      ? price.priceMinimumDuration
      : price.priceFixedDuration;
  const parsed = parseMoney(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
};

/** Monatlicher Grundpreis vor Anzahlung: Matrixpreis + Farbaufpreis. */
const getMonthlyBasePrice = (price, durationType, color) => {
  const matrixPrice = getMatrixPrice(price, durationType);
  if (!Number.isFinite(matrixPrice)) return NaN;
  return matrixPrice + getColorSurcharge(color);
};

/**
 * Grundpreis eines bestehenden Vertrags für Export/PDF.
 * Nutzt den beim Abschluss gespeicherten Farbaufpreis, nicht den aktuellen der Farbe.
 */
const getContractMonthlyBasePrice = (contract) => {
  const matrixPrice = getMatrixPrice(contract?.price, contract?.durationType);
  if (!Number.isFinite(matrixPrice)) return 0;
  return matrixPrice + getColorSurcharge({ priceSurcharge: contract?.colorSurcharge });
};

/**
 * Wählt die Farbe eines Fahrzeugs aus einer bereits geladenen Farbliste.
 * Wirft COLOR_NOT_FOUND, wenn die ID nicht zum Fahrzeug gehört. Mit
 * `required` wirft es COLOR_REQUIRED, wenn das Fahrzeug Farben hat, aber keine
 * gewählt wurde; ohne `required` gilt dann kein Farbaufpreis.
 */
const pickCarAboColor = (colors, colorId, { required = false } = {}) => {
  const list = Array.isArray(colors) ? colors : [];
  if (colorId === null || colorId === undefined || colorId === "") {
    if (required && list.length > 0) throw new Error("COLOR_REQUIRED");
    return null;
  }
  const id = Number.parseInt(colorId, 10);
  const color = list.find((c) => c.id === id);
  if (!color) throw new Error("COLOR_NOT_FOUND");
  return color;
};

/** Lädt die Farben eines Fahrzeugs und wählt die angefragte (siehe pickCarAboColor). */
const resolveCarAboColor = async (db, carAboId, colorId, options = {}) => {
  const colors = await db.CarAboColor.findAll({
    where: { carAboId },
    attributes: ["id", "carAboId", "colorName", "priceSurcharge", "isOrdered"],
    transaction: options.transaction,
  });
  return pickCarAboColor(colors, colorId, { required: options.required });
};

/** Aufschlag auf die Anzahlung, der auf die Monate umgelegt wird. */
const DEPOSIT_FEE_FACTOR = 1.025;

/** Monatsrate vor Rundung: Grundpreis minus umgelegte Anzahlung (inkl. Aufschlag). */
const getDepositAdjustedPrice = (basePrice, depositValue, durationMonths) => {
  const deposit = Number.parseFloat(depositValue) || 0;
  if (deposit <= 0) return basePrice;
  return basePrice - (deposit * DEPOSIT_FEE_FACTOR) / durationMonths;
};

/**
 * Rundet die Monatsrate auf ganze Euro. Warenkorb (syncCart) und Vertrag
 * (createContract) müssen exakt diese Funktion nutzen, sonst weichen der
 * angezeigte und der vertragliche Preis in Randfällen um 1 € ab.
 */
const roundMonthlyRate = (price) => Math.round(Number.parseFloat(price.toFixed(2)));

/**
 * Monatsrate eines neuen Vertrags aus dem Warenkorb. Wirft
 * PRICE_CONFIGURATION_INVALID oder COLOR_NOT_FOUND.
 *
 * Der Farbaufpreis kommt aus dem Warenkorb (`cartColorSurcharge`), nicht aus
 * der aktuellen Farbe: So gilt der Aufpreis, den der Kunde gesehen hat, auch
 * wenn er im CRM nachträglich geändert wird. Warenkörbe von vor dem
 * Farbaufpreis haben dort keinen Wert und zahlen keinen Aufpreis.
 *
 * Die Gesamtrate entspricht der Anzeige im Checkout:
 * round(calculatedMonthlyPrice + Versicherung).
 */
const computeContractPricing = ({
  prices,
  priceId,
  colors,
  colorId,
  cartColorSurcharge,
  durationType,
  depositValue,
  insurancePackage,
  insuranceCosts,
}) => {
  const selectedPrice =
    priceId && Array.isArray(prices)
      ? prices.find((price) => price.id === priceId)
      : null;
  if (!selectedPrice) {
    throw new Error("PRICE_CONFIGURATION_INVALID");
  }

  // Prüft nur, dass die Farbe zum Fahrzeug gehört (für Reservierung und
  // Vertrag). Bewusst ohne `required`, damit Altwarenkörbe abschließbar bleiben.
  const selectedColor = pickCarAboColor(colors, colorId);
  const colorSurcharge = selectedColor
    ? getColorSurcharge({ priceSurcharge: cartColorSurcharge })
    : 0;

  const duration = selectedPrice.durationMonths;
  const durationMonths = Number.parseInt(duration, 10);
  const validDurationType = durationType === "minimum" ? "minimum" : "fixed";
  const matrixPrice = getMatrixPrice(selectedPrice, validDurationType);
  if (
    !Number.isFinite(matrixPrice) ||
    !Number.isInteger(durationMonths) ||
    durationMonths <= 0
  ) {
    throw new Error("PRICE_CONFIGURATION_INVALID");
  }
  const basePrice = matrixPrice + colorSurcharge;

  const depVal = Number.parseFloat(depositValue) || 0;
  const monthlyDepositDiscount =
    depVal > 0 ? Math.round((depVal * DEPOSIT_FEE_FACTOR) / durationMonths) : 0;
  const calculatedMonthlyPrice = roundMonthlyRate(
    getDepositAdjustedPrice(basePrice, depVal, durationMonths),
  );

  let monthlyPrice = calculatedMonthlyPrice;
  if (insurancePackage) {
    const ins = Number.parseFloat(insuranceCosts);
    monthlyPrice = Math.round(monthlyPrice + (Number.isFinite(ins) ? ins : 0));
  }
  const totalCost = duration * monthlyPrice;

  return {
    selectedPrice,
    selectedColor,
    colorSurcharge,
    duration,
    basePrice,
    monthlyDepositDiscount,
    calculatedMonthlyPrice,
    monthlyPrice,
    totalCost,
  };
};

/**
 * Prüft, ob der neu berechnete Preis noch dem Warenkorbpreis entspricht.
 * Ohne gespeicherten Warenkorbpreis gibt es nichts zu vergleichen.
 */
const isCartPriceCurrent = (cartCalculatedMonthlyPrice, calculatedMonthlyPrice) => {
  if (cartCalculatedMonthlyPrice === null || cartCalculatedMonthlyPrice === undefined) {
    return true;
  }
  return Number(cartCalculatedMonthlyPrice) === calculatedMonthlyPrice;
};

const SURCHARGE_WHOLE_EURO_MESSAGE =
  "Der Farbaufpreis muss ein ganzer Euro-Betrag sein (z. B. 30).";

const PRICE_CHANGED_MESSAGE =
  "Der Preis für dein Fahrzeug hat sich geändert. Bitte prüfe deine Konfiguration und schließe die Buchung erneut ab.";

const COLOR_ERROR_MESSAGES = {
  COLOR_REQUIRED: "Bitte wähle eine Farbe für dein Fahrzeug aus.",
  COLOR_NOT_FOUND:
    "Die gewählte Farbe ist für dieses Fahrzeug nicht verfügbar. Bitte wähle sie erneut aus.",
};

module.exports = {
  getColorSurcharge,
  isWholeEuroSurcharge,
  SURCHARGE_WHOLE_EURO_MESSAGE,
  getMatrixPrice,
  getMonthlyBasePrice,
  getContractMonthlyBasePrice,
  pickCarAboColor,
  resolveCarAboColor,
  DEPOSIT_FEE_FACTOR,
  getDepositAdjustedPrice,
  roundMonthlyRate,
  computeContractPricing,
  isCartPriceCurrent,
  PRICE_CHANGED_MESSAGE,
  COLOR_ERROR_MESSAGES,
};
