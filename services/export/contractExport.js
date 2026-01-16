const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

async function generateContractPdf(contractInstance) {
  try {
    // 1. Pfade definieren
    const templatePath = path.join(
      __dirname,
      "../../templates/contract/Mietvertrag_vorlage.pdf"
    );
    const outputDir = path.join(__dirname, "../../internal-files/contracts");

    // Sicherstellen, dass der Ausgabeordner existiert
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (!fs.existsSync(templatePath)) {
      throw new Error(
        "PDF-Template wurde nicht gefunden unter: " + templatePath
      );
    }

    // 2. PDF laden
    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();

    // --- Hilfsfunktionen für Berechnungen (Netto/Brutto) ---
    const steuerSubtractor = (val) => (val ? parseFloat(val) / 1.19 : 0);
    const getSteuer = (val) =>
      val ? parseFloat(val) - parseFloat(val) / 1.19 : 0;

    const mainKosten = parseFloat(contractInstance.monthlyPrice || 0);
    const mainHaftung = contractInstance.insurancePackage
      ? parseFloat(contractInstance.insuranceCosts || 0)
      : 0;
    const mainLiefer = contractInstance.wantsDelivery
      ? parseFloat(contractInstance.deliveryCosts || 0)
      : 0;

    const totalMwSt =
      getSteuer(mainKosten) + getSteuer(mainHaftung) + getSteuer(mainLiefer);
    const monatsgebuehrNetto =
      steuerSubtractor(mainKosten) + steuerSubtractor(mainHaftung);

    // --- Daten-Mapping (Sequelize -> PDF) ---
    const fields = {
      geburtstag: contractInstance.User?.customerDetails?.birthday
        ? new Date(
            contractInstance.User.customerDetails.birthday
          ).toLocaleDateString("de-DE")
        : "",
      ort_datum: `Waldkirch, ${new Date().toLocaleDateString("de-DE")}`,
      kosten_pro_monat: steuerSubtractor(mainKosten).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
      }),
      sicherheitspaket_kosten: steuerSubtractor(mainHaftung).toLocaleString(
        "de-DE",
        { minimumFractionDigits: 2 }
      ),
      montatsgebuehr_zzg_mwst: totalMwSt.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
      }),
      montatsgebuehr: monatsgebuehrNetto.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
      }),
      monatsgebuehr_gesamt: (mainKosten + mainHaftung).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
      }), // Monatsgebühr Brutto
      lieferkosten: steuerSubtractor(mainLiefer).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
      }),
      starttermin: contractInstance.startingDate
        ? new Date(contractInstance.startingDate).toLocaleDateString("de-DE")
        : "",
      perso_nr: contractInstance.User?.customerDetails?.IdCardNumber || "",
      fuehrerschein_nr:
        contractInstance.User?.customerDetails?.driversLicenseNumber || "",
    };

    // SEPA String zusammenbauen
    const sepaInfo = [
      contractInstance.iban,
      contractInstance.accountHolderName,
      `${contractInstance.User?.customerDetails?.street || ""} ${
        contractInstance.User?.customerDetails?.housenumber || ""
      }`,
      `${contractInstance.User?.customerDetails?.postalCode || ""} ${
        contractInstance.User?.customerDetails?.city || ""
      }`,
    ]
      .filter((part) => part.trim() !== "")
      .join(", ");

    fields["mandatsreferenz_info"] = sepaInfo;

    // --- Textfelder befüllen ---
    Object.entries(fields).forEach(([key, value]) => {
      try {
        const textField = form.getTextField(key);
        textField.setText(String(value));
      } catch (e) {
        // Falls ein Feld im PDF fehlt, loggen wir es nur als Info
        console.info(`Feld-Mapping übersprungen: ${key}`);
      }
    });

    // --- "Checkboxen" über Textfelder steuern ---
    const setCheck = (name, condition) => {
      try {
        const textField = form.getTextField(name);
        // Wenn die Bedingung wahr ist, schreibe ein X, sonst leere das Feld
        textField.setText(condition ? "X" : "");
      } catch (e) {
        // Falls das Feld im PDF doch eine echte Checkbox ist,
        // versuchen wir es als Fallback hiermit:
        try {
          const cb = form.getCheckBox(name);
          if (condition) cb.check();
          else cb.uncheck();
        } catch (innerError) {
          console.warn(
            `Feld ${name} konnte weder als Textfeld noch als Checkbox markiert werden.`
          );
        }
      }
    };

    // Aufruf bleibt identisch:
    setCheck(`laufzeit_${contractInstance.duration}`, true);
    setCheck("freikilometer_1250", true);
    setCheck("haftungsreduzierung_ja", contractInstance.insurancePackage);
    setCheck("haftungsreduzierung_nein", !contractInstance.insurancePackage);
    setCheck("lieferung_ja", contractInstance.wantsDelivery);
    setCheck("lieferung_nein", !contractInstance.wantsDelivery);

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
