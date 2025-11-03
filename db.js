const mysql = require("mysql2");

// Use Railway environment variables if available
const db = mysql.createConnection({
  host: process.env.MYSQLHOST || "localhost",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "root",
  database: process.env.MYSQLDATABASE || "rendezvous_db",
  port: parseInt(process.env.MYSQLPORT) || 3306, // ← CORRIGÉ : parseInt() + minuscule
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000
});

db.connect((err) => {
  if (err) {
    console.error("❌ Erreur de connexion MySQL:", err);
    console.error("🔍 Détails:", {
      host: process.env.MYSQLHOST,
      port: process.env.MYSQLPORT,
      database: process.env.MYSQLDATABASE
    });
    return;
  }
  console.log("✅ Connecté à MySQL");
});

// Gestion des erreurs après connexion
db.on('error', (err) => {
  console.error('❌ Erreur MySQL après connexion:', err);
});

module.exports = db;