require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const rendezvousRoutes = require("./routes/rendezvous");
const authRoutes = require("./routes/auth");
const authDGRoutes = require("./routes/authDG");
const directorRoutes = require("./routes/director");

const app = express();

// ✅ CORS configuration
const allowedOrigins = [
  "https://rendez-vous-app.vercel.app", // frontend
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// ✅ Serve uploads (QR codes, images, etc.)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ API Routes
app.use("/api/rendezvous", rendezvousRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth/dg", authDGRoutes);
app.use("/api/director", directorRoutes);

// ✅ Health Check
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Serveur fonctionne correctement" });
});

// ✅ Error handling
app.use((err, req, res, next) => {
  console.error("Erreur serveur:", err);
  res.status(500).json({ error: "Erreur interne du serveur" });
});

// ✅ 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint non trouvé" });
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});

module.exports = app;
