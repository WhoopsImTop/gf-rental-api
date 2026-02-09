const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

async function generateContractPdf(contractInstance) {
  try {
    // 1. Pfade definieren
    const templatePath = path.join(__dirname, "../../templates/contract/Auto-Abo-Mietvertrag.pdf");
    const outputDir = path.join(__dirname, "../../internal-files/contracts");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (!fs.existsSync(templatePath)) {
      throw new Error("PDF-Template wurde nicht gefunden unter: " + templatePath);
    }

    // 2. PDF laden
    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();

    // --- Hilfsfunktionen für Berechnungen (Netto/Brutto gemäß 19% MwSt) ---
    const getNetto = (brutto) => (brutto ? parseFloat(brutto) / 1.19 : 0);
    const getMwStAnteil = (brutto) => (brutto ? parseFloat(brutto) - (parseFloat(brutto) / 1.19) : 0);

    const bruttoMiete = parseFloat(contractInstance.monthlyPrice || 0);
    const bruttoHaftung = contractInstance.insurancePackage ? parseFloat(contractInstance.insuranceCosts || 0) : 0;
    const bruttoLieferung = contractInstance.wantsDelivery ? parseFloat(contractInstance.deliveryCosts || 0) : 0;

    // Summenbildung für die Kostenaufstellung [cite: 38-43]
    const monatsgebuehrNettoGesamt = getNetto(bruttoMiete) + getNetto(bruttoHaftung);
    const mwstGesamt = getMwStAnteil(bruttoMiete) + getMwStAnteil(bruttoHaftung);
    const monatsgebuehrBruttoGesamt = bruttoMiete + bruttoHaftung;

    // --- Daten-Mapping (Orientiert an den Quellen 1-47) ---
    const fields = {
      // Kopfdaten
      "mietvertragNummer": contractInstance.id.toString(), // [cite: 1, 2]
      "finNummer": contractInstance.vin || "", // 

      // Mieter Informationen [cite: 11-20]
      "mandatsreferenzNummer": contractInstance.mandateReference || "",
      "iban": contractInstance.iban || "",
      "kontoinhaber": contractInstance.accountHolderName || "",
      "strasse": `${contractInstance.User?.customerDetails?.street || ""} ${contractInstance.User?.customerDetails?.housenumber || ""}`,
      "postleitzahl": contractInstance.User?.customerDetails?.postalCode || "",
      "ort": contractInstance.User?.customerDetails?.city || "",
      "geburtsdatum": contractInstance.User?.customerDetails?.birthday 
        ? new Date(contractInstance.User.customerDetails.birthday).toLocaleDateString("de-DE") : "",
      "personalausweisnummer": contractInstance.User?.customerDetails?.IdCardNumber || "",
      "fuehrerscheinnummer": contractInstance.User?.customerDetails?.driversLicenseNumber || "",

      // Vertragsdetails [cite: 24-37]
      "mindestlaufzeit": `${contractInstance.duration || ''} Monate`,
      "kilometerleistung": `${contractInstance.mileage || ''} km/Monat`,
      "familyAndFriends": contractInstance.additionalDrivers || "Keine",
      
      // Kostenaufstellung [cite: 39-45]
      "nettoMietgebuehrMonatlich": getNetto(bruttoMiete).toLocaleString("de-DE", { minimumFractionDigits: 2 }),
      "haftungsreduzierungNettoMonatlich": getNetto(bruttoHaftung).toLocaleString("de-DE", { minimumFractionDigits: 2 }),
      "monatsgebuehrBrutto": monatsgebuehrNettoGesamt.toLocaleString("de-DE", { minimumFractionDigits: 2 }),
      "steuern": mwstGesamt.toLocaleString("de-DE", { minimumFractionDigits: 2 }),
      "monatsgebuehrBrutto": monatsgebuehrBruttoGesamt.toLocaleString("de-DE", { minimumFractionDigits: 2 }),
      "lieferkosten": bruttoLieferung.toLocaleString("de-DE", { minimumFractionDigits: 2 }),
      "anzahlung": (contractInstance.deposit || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 }),
      
      "ortDatum": `Waldkirch, den ${new Date().toLocaleDateString("de-DE")}`, // [cite: 46]
    };

    // Textfelder befüllen
    Object.entries(fields).forEach(([key, value]) => {
      try {
        const textField = form.getTextField(key);
        textField.setText(String(value));
      } catch (e) {
        console.info(`Feld-Mapping übersprungen: ${key}`);
      }
    });

    // --- Checkboxen (Haftungsreduzierung & Zustellung)  ---
    const setCheck = (name, condition) => {
      try {
        const cb = form.getCheckBox(name);
        if (condition) cb.check(); else cb.uncheck();
      } catch (e) {
        // Fallback falls die Felder als Textfelder (☐) definiert sind
        try {
          const tf = form.getTextField(name);
          tf.setText(condition ? "X" : "");
        } catch (inner) {
          console.warn(`Checkbox ${name} konnte nicht gesetzt werden.`);
        }
      }
    };

    // Mapping für Checkboxen
    setCheck("haftungsreduzierung_ja", contractInstance.insurancePackage); // Haftungsreduzierung Ja [cite: 29]
    setCheck("haftungsreduzierung_nein", !contractInstance.insurancePackage); // Haftungsreduzierung Nein [cite: 30]
    setCheck("fahrzeugzustellung_ja", contractInstance.wantsDelivery); // [cite: 32]
    setCheck("fahrzeugzustellung_nein", !contractInstance.wantsDelivery); // [cite: 33]

    const pdfBytes = await pdfDoc.save();
    const fileName = `vertrag_${contractInstance.id}_${Date.now()}.pdf`;
    const fullPath = path.join(outputDir, fileName);

    fs.writeFileSync(fullPath, pdfBytes);
    return fileName;

  } catch (error) {
    console.error("Fehler bei der PDF-Generierung:", error);
    throw error;
  }
}

module.exports = { generateContractPdf };