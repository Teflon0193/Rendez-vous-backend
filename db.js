require("dotenv").config();
const mysql = require("mysql2");

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
  console.log("✅ Connecté à MySQL:", process.env.MYSQLDATABASE);
});

module.exports = db;
