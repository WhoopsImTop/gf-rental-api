const fs = require("fs");
const logFiles = ["geoCoder", "debug", "error", "info", "warn"];

exports.logger = (logType, message) => {
  const folder = "./logs";
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  }
  if (!logFiles.includes(logType)) {
    throw new Error("Invalid log type");
  }
  const date = new Date();
  const logMessage = `${date.toISOString()} - ${message}\n`;
  fs.appendFile(`${folder}/${logType}.log`, logMessage, (err) => {
    if (err) {
      console.error(err);
    }
  });
};
