const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { sequelize } = require("./models");

//import routes
const carAboRoute = require("./routes/carAboRoute");
const crmCustomerRoute = require("./routes/crm/customerRoute");
const statusRoute = require("./routes/crm/statusRoute");
const userRoute = require("./routes/general/userRoute");

const AuthentificationRoute = require("./routes/auth/AuthentificationRoute");
const AuthMiddleware = require("./middleware/authMiddleware");

const serverPort = process.env.SERVERPORT || 3000;
const app = express();

// Middleware
app.use(bodyParser.json());
const corsOptions = {
  origin: "*", // Erlaube alle Ursprünge
  methods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"], // Erlaubte Header
};

app.all("*", cors(corsOptions));

//make public folder static
app.use(express.static("public"));

// Allgemeine Fehlerbehandlung
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Interner Serverfehler!" });
});

// Route zum Testen
app.get("/", (req, res) => {
  res.send("Server läuft!");
});

// Routen
app.use("/api/auth", AuthentificationRoute);
app.use("/api/users", AuthMiddleware, userRoute);
app.use("/api/car-abos", carAboRoute);

//CRM-Routes
app.use("/api/crm/customers", AuthMiddleware, crmCustomerRoute);
app.use("/api/crm/status", statusRoute);

// Server starten und Datenbankverbindung prüfen
app.listen(serverPort, async () => {
  console.log(`Server läuft auf http://localhost:${serverPort}`);

  try {
    await sequelize.authenticate(); // Verbindung zur Datenbank testen
    console.log("Datenbankverbindung erfolgreich!");
  } catch (error) {
    console.error("Fehler bei der Verbindung zur Datenbank:", error);
    process.exit(1); // Beende den Prozess, falls die Verbindung fehlschlägt
  }
});
