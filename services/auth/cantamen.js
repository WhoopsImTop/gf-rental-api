async function authentificateWithCantamen(email, password) {
  if (!email) {
    throw new Error("Bitte geben Sie ihre E-Mail-Adresse ein.");
  }

  if (!password) {
    throw new Error("Bitte geben Sie ein Passwort ein.");
  }

  const url = process.env.CANTAMEN_TOKEN_URL;
  const apiKey = process.env.CANTAMEN_API_KEY;
  const provId = process.env.CANTAMEN_PROV_ID;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      credential: password,
      login: email,
      provId: provId,
      storeLogin: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Authentifizierung fehlgeschlagen: ${response.status}`);
  }

  const data = await response.json();
  const { id } = data;

  return { id };
}

async function collectUserDataFromCantamen(id) {
  const apiKey = process.env.CANTAMEN_API_KEY;
  const authToken = btoa(id + ":");
  const userData = await getDefaultUserInformation(authToken, apiKey);
  const sepaMandate = await checkForSepaMandate(authToken, apiKey);

  return {
    userData,
    sepaMandate,
  };
}

async function getDefaultUserInformation(token, key) {
  const url = process.env.CANTAMEN_CUSTOMER_URL;

  const response = await fetch(url, {
    headers: {
      authorization: "Basic " + token,
      "X-Api-Key": key,
    },
  });

  if (!response.ok) {
    throw new Error(`Fehler beim Abrufen der Kundendaten: ${response.status}`);
  }

  const data = await response.json();

  const {
    birthDate,
    birthPlace,
    blocked,
    creditRatingAllowed,
    customerNumber,
    driverlicenseClassesAllowed,
    driverlicenseIssued,
    driverlicenseIssuedPlace,
    driverlicenseNumber,
    driverlicenseValidUntil,
    emailAddress,
    gender,
    identityNumber,
    mobilePhoneNr,
    prename,
    name,
    address,
  } = data;

  return {
    birthDate,
    birthPlace,
    blocked,
    creditRatingAllowed,
    customerNumber,
    driverlicenseClassesAllowed,
    driverlicenseIssued,
    driverlicenseIssuedPlace,
    driverlicenseNumber,
    driverlicenseValidUntil,
    emailAddress,
    gender,
    identityNumber,
    mobilePhoneNr,
    prename,
    name,
    address,
  };
}

async function checkForSepaMandate(token, key) {
  const url = process.env.CANTAMEN_SEPA_MANDATE;

  const response = await fetch(url, {
    headers: {
      authorization: "Basic " + token,
      "X-Api-Key": key,
    },
  });

  if (!response.ok) {
    throw new Error(`Fehler beim Abrufen der SEPA-Daten: ${response.status}`);
  }

  const sepaMandateData = await response.json();

  const hasActiveSepaMandate =
    new Date(sepaMandateData[0].expiry) > new Date() &&
    (sepaMandateData[0].validity?.end != null
      ? new Date(sepaMandateData[0].validity.end) > new Date()
      : true);

  return hasActiveSepaMandate;
}

module.exports = {
  authentificateWithCantamen,
  collectUserDataFromCantamen,
  checkForSepaMandate,
};
