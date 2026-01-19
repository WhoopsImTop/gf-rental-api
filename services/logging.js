const fs = require("fs");
const { sendErrorEmail } = require("../services/mailService");

const logFiles = ["geoCoder", "debug", "error", "info", "warn"];

exports.logger = (logType, message) => {
  const folder = "./logs";

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  if (!logFiles.includes(logType)) {
    throw new Error(`Invalid log type: ${logType}`);
  }

  if (logType === "error") {
    sendErrorEmail(message);
  }

  const date = new Date();
  const logMessage = `${date.toISOString()} - ${message}\n`;

  fs.appendFile(`${folder}/${logType}.log`, logMessage, (err) => {
    if (err) {
      console.error("Failed to write log:", err);
    }
  });
};
