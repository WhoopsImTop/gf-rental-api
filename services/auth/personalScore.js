const { logger } = require("../logging");

async function getUserScore(firstName, lastName, birthday, street, zipCode, city, orderId) {
    const url = process.env.PERSONAL_SCORE_URL;

    //birthday must be formed dd.mm.yyyy
    const date = new Date(birthday);
    const formattedBirthday = `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;

    /*const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            vorname: firstName,
            nachname: lastName,
            geburtsdatum: formattedBirthday,
            strasse: street,
            plz: zipCode,
            ort: city,
            bestellid: orderId,
        }),
    });

    if (!response.ok) {
        logger('error', `Schufa Prüfung fehlgeschlagen: ${response.status}, Bestellnummer: ${firstName} ${lastName} ${birthday} ${street} ${zipCode} ${city}`);
    }

    const data = await response.json();
    const score = data.response;

    if (!score) {
        logger('error', `Schufa Prüfung fehlgeschlagen: ${response.status}, Bestellnummer: ${firstName} ${lastName} ${birthday} ${street} ${zipCode} ${city}`);
        throw new Error(`Schufa Prüfung fehlgeschlagen: ${response.status}`);
    }

    logger('error', `Schufa Prüfung erfolgreich: ${score}, Bestellnummer: ${firstName} ${lastName} ${birthday} ${street} ${zipCode} ${city}`);*/

    logger('error', 'SCHUFA PRÜFUNG DEAKTIVIERT RETURN A')
    score = 'A';
    return { score };
}

module.exports = {
    getUserScore,
};
