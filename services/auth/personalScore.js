const { logger } = require("../logging");

async function getUserScore(firstName, lastName, birthday, street, zipCode, city, orderId) {
    const url = process.env.PERSONAL_SCORE_URL;

    //birthday must be formed dd.mm.yyyy
    const date = new Date(birthday);

	const day = String(date.getUTCDate()).padStart(2, '0');
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const year = date.getUTCFullYear();

	const formattedBirthday = `${day}.${month}.${year}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            vorname: firstName,
            nachname: lastName,
            geburtsdatum: formattedBirthday,
			geschlecht: 'U',
            strasse: street,
            plz: zipCode,
            ort: city,
            bestellid: orderId,
        }),
    });

    if (!response.ok) {
        logger("error", `Schufa Prüfung fehlgeschlagen: ${response.status}`);
    }

    const data = await response.json();
    const score = data.response;

    if (!score) {
        logger("error", `Schufa Prüfung fehlgeschlagen: ${response.status}`);
        throw new Error(`Schufa Prüfung fehlgeschlagen: ${response.status}`);
    }

    logger('error', `Schufa Prüfung erfolgreich: ${score}, Bestellnummer: ${firstName}`);

    return { score };
}

module.exports = {
    getUserScore,
};
