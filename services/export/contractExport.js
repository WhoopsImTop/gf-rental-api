const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

async function generateContractPdf(contractInstance) {
  try {
    // 1. Pfade definieren
    const templatePath = path.join(
      __dirname,
      "../../templates/contract/Mietvertrag_vorlage.pdf",
    );
    const outputDir = path.join(__dirname, "../../internal-files/contracts");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (!fs.existsSync(templatePath)) {
      throw new Error(
        "PDF-Template wurde nicht gefunden unter: " + templatePath,
      );
    }

    // 2. PDF laden
    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();

    // --- Hilfsfunktionen für Berechnungen (Netto/Brutto gemäß 19% MwSt) ---
    const getNetto = (brutto) => (brutto ? parseFloat(brutto) / 1.19 : 0);
    const getMwStAnteil = (brutto) =>
      brutto ? parseFloat(brutto) - parseFloat(brutto) / 1.19 : 0;

    const bruttoMiete = parseFloat(
      contractInstance.calculatedMonthlyPrice || 0,
    );
    const bruttoHaftung = contractInstance.insurancePackage
      ? parseFloat(contractInstance.insuranceCosts || 0)
      : 0;
    const bruttoLieferung = contractInstance.wantsDelivery
      ? parseFloat(contractInstance.deliveryCosts || 0)
      : 0;

    // Vertragsdauer in Monaten (Fallback auf möglichen Umbenennungen in anderen Datenflüssen)
    const durationMonths =
      contractInstance.laufzeit ?? contractInstance.duration ?? "";
    const durationMonthsNumber = parseInt(durationMonths, 10);
    const durationUnit =
      !Number.isNaN(durationMonthsNumber) && durationMonthsNumber === 1
        ? "Monat"
        : "Monate";
    const durationDisplay =
      durationMonths === "" || Number.isNaN(durationMonthsNumber)
        ? ""
        : `${durationMonths} ${durationUnit}`;

    // Summenbildung für die Kostenaufstellung [cite: 38-43]
    const monatsgebuehrNettoGesamt =
      getNetto(bruttoMiete) + getNetto(bruttoHaftung);
    const mwstGesamt =
      getMwStAnteil(bruttoMiete) + getMwStAnteil(bruttoHaftung);
    const monatsgebuehrBruttoGesamt = bruttoMiete + bruttoHaftung;
    // --- Daten-Mapping (Orientiert an den Quellen 1-47) ---
    const fields = {
      // Kopfdaten
      mietvertragNummer: contractInstance.id.toString(), // [cite: 1, 2]
      finNummer: contractInstance.color?.vin || "", //
      cantamenKundennummer: contractInstance.User?.cantamenCustomerId || "",

      // Mieter Informationen [cite: 11-20]
      vornameNachname: `${contractInstance.User?.firstName || ""} ${contractInstance.User?.lastName || ""}`,
      mandatsreferenzNummer: contractInstance.mandateReference || "",
      iban: contractInstance.iban || "",
      kontoinhaber: contractInstance.accountHolderName || "",
      strasse: `${contractInstance.User?.customerDetails?.street || ""} ${contractInstance.User?.customerDetails?.housenumber || ""}`,
      postleitzahl: contractInstance.User?.customerDetails?.postalCode || "",
      ort: contractInstance.User?.customerDetails?.city || "",
      geburtsdatum: contractInstance.User?.customerDetails?.birthday
        ? new Date(
            contractInstance.User.customerDetails.birthday,
          ).toLocaleDateString("de-DE")
        : "",
      personalausweisnummer:
        contractInstance.User?.customerDetails?.IdCardNumber || "",
      fuehrerscheinnummer:
        contractInstance.User?.customerDetails?.driversLicenseNumber || "",
      fuehrerscheinKlassen:
        contractInstance.User?.customerDetails?.allowedLicenseClasses || "",
      fuehrerscheinAblaufsdatum: contractInstance.User?.customerDetails
        ?.licenseValidUntil
        ? new Date(
            contractInstance.User.customerDetails.licenseValidUntil,
          ).toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : "",
      fuehrerscheinAusstelldatum: contractInstance.User?.customerDetails
        ?.licenseIssuedOn
        ? new Date(
            contractInstance.User.customerDetails.licenseIssuedOn,
          ).toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : "",
      fuehrerscheinAusstellungsort:
        contractInstance.User?.customerDetails?.licenseIssuingPlace || "",
      geburtsort: contractInstance.User?.customerDetails?.placeOfBirth || "",

      // Vertragsdetails [cite: 24-37]
      laufzeit: durationDisplay,
      kilometerleistung: `${contractInstance.price?.mileageKm || ""} km/Monat`,
      freikilometer: `${contractInstance.price?.mileageKm || ""} km/Monat`,
      mehrkilometer: "",
      mehrkilometerMultiplikator: "",
      kilometerstandAnkunft: "",
      kilometerstandAbfahrt: "",

      "selbstbeteiligung-vollkasko": (
        contractInstance.insuranceDeductibleHaftpflicht || 0
      ).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
      }),
      "selbstbeteiligung-teilkasko": (
        contractInstance.insuranceDeductibleTeilkasko || 0
      ).toLocaleString("de-DE", { minimumFractionDigits: 2 }),

      //loop over all family and friends entries and make a list firstname lastname birthday
      familyAndFriends:
        contractInstance.familyAndFriendsMembers &&
        contractInstance.familyAndFriendsMembers.length > 0
          ? contractInstance.familyAndFriendsMembers
              .map(
                (member) =>
                  `${member.firstName} ${member.lastName}, ${new Date(member.birthday).toLocaleDateString("de-DE")}`,
              )
              .join(",  \n")
          : "Keine",
      // Kostenaufstellung [cite: 39-45]
      invoiceCarName: contractInstance.carAbo?.displayName || "",
      InvoiceSavetyPackageName:
        contractInstance.insuranceType === "premium"
          ? "Premium"
          : contractInstance.insuranceType === "basic"
            ? "Basic"
            : "Standard",

      invoiceCarMonthlyNetto: getNetto(bruttoMiete).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      InvoiceSavetyPackageNetto: getNetto(bruttoHaftung).toLocaleString(
        "de-DE",
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      ),

      invoiceCarVat: getMwStAnteil(bruttoMiete).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      InvoiceSavetyPackageVat: getMwStAnteil(bruttoHaftung).toLocaleString(
        "de-DE",
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      ),

      InvoiceCarMonthlyBrutto: bruttoMiete.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      InvoiceSavetyPackageBrutto: bruttoHaftung.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),

      InvoiceDeliveryCosts: bruttoLieferung.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      InvoiceDepositPayment: (
        contractInstance.depositValue || 0
      ).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),

      MonthlyTotalBrutto: monatsgebuehrBruttoGesamt.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
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
        if (condition) cb.check();
        else cb.uncheck();
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

    setCheck("mindestlaufzeit", contractInstance.durationType == "minimum");
    setCheck("fixlaufzeit", contractInstance.durationType == "fixed");

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
