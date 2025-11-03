const mysql = require("mysql2");

// Use Railway environment variables if available
const db = mysql.createConnection({
  host: process.env.MYSQLHOST || "localhost",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "root",
  database: process.env.MYSQLDATABASE || "rendezvous_db",
  port: process.env.MYSQLPORT || 3306,
});

db.connect((err) => {
  if (err) {
    console.error("❌ Erreur de connexion MySQL:", err);
    return;
  }
  console.log("✅ Connecté à MySQL");
});

module.exports = db;
