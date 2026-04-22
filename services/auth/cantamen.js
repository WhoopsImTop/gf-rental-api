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
  const { hasActiveSepaMandate, activeSepaMandate } = await getSepaMandateData(
    authToken,
    apiKey,
  );
  const activeSepaAccount = await getActiveSepaAccount(authToken, apiKey);

  return {
    userData,
    sepaMandate: hasActiveSepaMandate,
    sepaMandateReference: activeSepaMandate?.reference || null,
    sepaAccount: activeSepaAccount
      ? {
          iban: activeSepaAccount.iban || null,
          accountHolder: activeSepaAccount.accountHolder || null,
        }
      : null,
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

function isEntryActive(entry) {
  if (!entry) return false;
  const now = new Date();
  const start = entry.validity?.start ? new Date(entry.validity.start) : null;
  const end = entry.validity?.end ? new Date(entry.validity.end) : null;
  const expiry = entry.expiry ? new Date(entry.expiry) : null;

  if (start && start > now) return false;
  if (end && end <= now) return false;
  if (expiry && expiry <= now) return false;

  return true;
}

function getMostRecentActiveEntry(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const active = entries.filter(isEntryActive);
  if (active.length === 0) return null;

  return active.sort((a, b) => {
    const aStart = a.validity?.start ? new Date(a.validity.start).getTime() : 0;
    const bStart = b.validity?.start ? new Date(b.validity.start).getTime() : 0;
    return bStart - aStart;
  })[0];
}

async function getSepaMandateData(token, key) {
  const url =
    process.env.CANTAMEN_SEPA_MANDATE ||
    "https://de1.cantamen.de/casirest/v3/sepamandates";

  const response = await fetch(url, {
    headers: {
      authorization: "Basic " + token,
      "X-Api-Key": key,
    },
  });

  if (!response.ok) {
    throw new Error(`Fehler beim Abrufen der SEPA-Daten: ${response.status}`);
  }

  const sepaMandates = await response.json();
  const activeSepaMandate = getMostRecentActiveEntry(sepaMandates);

  return {
    hasActiveSepaMandate: !!activeSepaMandate,
    activeSepaMandate,
  };
}

async function getActiveSepaAccount(token, key) {
  const url =
    process.env.CANTAMEN_SEPA_ACCOUNTS ||
    "https://de1.cantamen.de/casirest/v3/sepaaccounts";

  const response = await fetch(url, {
    headers: {
      authorization: "Basic " + token,
      "X-Api-Key": key,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Fehler beim Abrufen der SEPA-Kontodaten: ${response.status}`,
    );
  }

  const sepaAccounts = await response.json();
  return getMostRecentActiveEntry(sepaAccounts);
}

module.exports = {
  authentificateWithCantamen,
  collectUserDataFromCantamen,
  getSepaMandateData,
};
