const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

async function generateContractPdf(contractInstance, options = {}) {
  try {
    // 1. Pfade definieren
    const defaultTemplatePath = path.join(
      __dirname,
      "../../templates/contract/Mietvertrag_vorlage.pdf",
    );
    const outputDir = path.join(__dirname, "../../internal-files/contracts");
    const sourceFileName = options.sourceFileName
      ? path.basename(options.sourceFileName)
      : null;
    const sourceFilePath = sourceFileName
      ? path.join(outputDir, sourceFileName)
      : null;
    const usesUploadedSource = !!(
      sourceFilePath && fs.existsSync(sourceFilePath)
    );
    const templatePath = usesUploadedSource
      ? sourceFilePath
      : defaultTemplatePath;

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
    const signatureFullName = options.signatureFullName || "";
    const signatureDate = options.signedAt ? new Date(options.signedAt) : null;
    const signatureDateLabel = signatureDate
      ? signatureDate.toLocaleDateString("de-DE")
      : "";
    const signatureTimestamp = signatureDate
      ? signatureDate.toLocaleString("de-DE")
      : "";
    const signaturePlace = contractInstance.User?.customerDetails?.city || "";
    const signatureDateWithPlace =
      signatureDateLabel && signaturePlace
        ? `${signatureDateLabel}, ${signaturePlace}`
        : signatureDateLabel || signaturePlace;
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
      customerContractSignature: signatureFullName,
      customerContractDate: signatureDateWithPlace,
      customerSEPASignature: "",
      customerSEPADate: signatureDateWithPlace,
    };

    const normalizeFieldName = (value) =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const resolveCandidateNames = (fieldName, aliases = []) => {
      const requested = [fieldName, ...aliases].filter(Boolean);
      const allFieldNames = form.getFields().map((field) => field.getName());
      const resolved = [];

      requested.forEach((candidate) => {
        if (allFieldNames.includes(candidate)) {
          resolved.push(candidate);
          return;
        }
        const normalizedCandidate = normalizeFieldName(candidate);
        const fuzzyMatch = allFieldNames.find(
          (existing) => normalizeFieldName(existing) === normalizedCandidate,
        );
        if (fuzzyMatch) {
          resolved.push(fuzzyMatch);
        } else {
          resolved.push(candidate);
        }
      });

      return [...new Set(resolved)];
    };

    const setFieldValue = (fieldName, value, aliases = []) => {
      const candidateNames = resolveCandidateNames(fieldName, aliases);
      for (const name of candidateNames) {
        try {
          const textField = form.getTextField(name);
          textField.setText(String(value ?? ""));
          return true;
        } catch (error) {
          // Try next alias
        }
      }
      return false;
    };

    // Textfelder nur bei Standard-Template automatisch befüllen.
    // Bei hochgeladenen Vertrags-PDFs sollen manuelle Anpassungen erhalten bleiben.
    if (!usesUploadedSource) {
      Object.entries(fields).forEach(([key, value]) => {
        try {
          setFieldValue(key, value);
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
    }

    if (options.signatureImageBuffer) {
      const signatureImage = await pdfDoc.embedPng(
        options.signatureImageBuffer,
      );
      const proofFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const signatureProofText = signatureDateLabel
        ? `Elektronisch Signiert am: ${signatureDateLabel}`
        : "Elektronisch Signiert";

      const setSignatureInButtonField = (fieldName, aliases = []) => {
        const candidateNames = resolveCandidateNames(fieldName, aliases);
        for (const name of candidateNames) {
          try {
            const buttonField = form.getButton(name);
            buttonField.setImage(signatureImage);
            return true;
          } catch (error) {
            // Try next alias/type
          }
        }
        return false;
      };

      const drawSignatureIntoFieldWidget = (fieldName, aliases = []) => {
        const candidateNames = resolveCandidateNames(fieldName, aliases);

        const findPageForWidget = (widget, pageRef) => {
          if (pageRef) {
            const fromPageRef = pdfDoc
              .getPages()
              .find(
                (pg) =>
                  pg.ref?.objectNumber === pageRef.objectNumber &&
                  pg.ref?.generationNumber === pageRef.generationNumber,
              );
            if (fromPageRef) return fromPageRef;
          }

          const widgetRef = widget?.ref;
          if (!widgetRef) return null;
          return pdfDoc.getPages().find((pg) => {
            const annots = pg.node.Annots();
            if (!annots) return false;
            return annots
              .asArray()
              .some(
                (annotRef) =>
                  annotRef.objectNumber === widgetRef.objectNumber &&
                  annotRef.generationNumber === widgetRef.generationNumber,
              );
          });
        };

        for (const name of candidateNames) {
          try {
            const anyField = form.getField(name);
            const widgets = anyField.acroField?.getWidgets?.() || [];
            for (const widget of widgets) {
              const rect = widget.getRectangle?.();
              const pageRef = widget.P?.();
              if (!rect) continue;
              const page = findPageForWidget(widget, pageRef);
              if (!page) continue;

              const scaled = signatureImage.scale(1);
              const targetWidth = rect.width * 0.94;
              const targetHeight = rect.height * 0.8;
              const drawWidth = Math.min(
                targetWidth,
                (scaled.width / scaled.height) * targetHeight,
              );
              const drawHeight = (scaled.height / scaled.width) * drawWidth;
              // Left-align signature inside field with small padding
              const x = rect.x + 6;
              const y = rect.y + (rect.height - drawHeight) / 2;

              page.drawImage(signatureImage, {
                x,
                y,
                width: drawWidth,
                height: drawHeight,
              });

              const proofX = x + drawWidth + 6;
              const proofY = y + drawHeight - 8;
              if (proofX < rect.x + rect.width - 40) {
                page.drawText(signatureProofText, {
                  x: proofX,
                  y: proofY,
                  size: 7,
                  lineHeight: 8,
                  font: proofFont,
                  color: rgb(0.2, 0.2, 0.2),
                  maxWidth: Math.max(40, rect.x + rect.width - proofX - 2),
                });
              }
            }
            return true;
          } catch (error) {
            // try next alias
          }
        }
        return false;
      };

      const signatureAliases = [
        "customerContractSignature ",
        "customerContractSignature",
        "customer contract signature",
        "customer_contract_signature",
      ];
      let signatureDrawn = drawSignatureIntoFieldWidget(
        "customerContractSignature",
        signatureAliases,
      );
      if (!signatureDrawn) {
        signatureDrawn = setSignatureInButtonField(
          "customerContractSignature",
          signatureAliases,
        );
      }
      // Fallback for templates where signature fields are plain text
      if (!signatureDrawn) {
        setFieldValue(
          "customerContractSignature",
          options.signatureFullName || "",
        );
      }
      setFieldValue("customerContractDate", signatureDateWithPlace, [
        "CustomerContractDate",
      ]);
      setFieldValue("customerSEPADate", signatureDateWithPlace, [
        "CustomerSEPADate",
      ]);

      // Signatur nur in den vorgesehenen PDF-Feldern platzieren.
    }

    // Ensure values are visually rendered for viewers that rely on appearances.
    form.updateFieldAppearances();

    const pdfBytes = await pdfDoc.save();
    const fileName = options.filePrefix
      ? `${options.filePrefix}_${contractInstance.id}_${Date.now()}.pdf`
      : `vertrag_${contractInstance.id}_${Date.now()}.pdf`;
    const fullPath = path.join(outputDir, fileName);

    fs.writeFileSync(fullPath, pdfBytes);
    return fileName;
  } catch (error) {
    console.error("Fehler bei der PDF-Generierung:", error);
    throw error;
  }
}

module.exports = { generateContractPdf };
