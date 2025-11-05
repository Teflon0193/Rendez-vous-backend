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

// Middleware
app.use(
  cors({
    origin: [
      "https://rendez-vous-app.vercel.app", // deployed frontend
      "http://localhost:3000",              // local dev
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ✅ Handle preflight requests
app.options("/*", cors());

app.use(bodyParser.json({ limit: "10mb" })); // Increased limit for QR codes
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// Serve static files (for QR codes if needed)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/rendezvous", rendezvousRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth/dg", authDGRoutes);
app.use("/api/director", directorRoutes);


// check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Serveur fonctionne correctement" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Erreur serveur:", err);
  res.status(500).json({ error: "Erreur interne du serveur" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint non trouvé" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
 console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});

module.exports = app;