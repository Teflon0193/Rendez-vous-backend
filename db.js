require("dotenv").config();
const mysql = require("mysql2/promise"); 

// Créer un pool de connexions
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || "localhost",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "root",
  database: process.env.MYSQLDATABASE || "rendezvous_db",
  port: process.env.MYSQLPORT || 3306,
  waitForConnections: true,
  connectionLimit: 10, // nombre de connexions simultanées
  queueLimit: 0,
});

pool.getConnection()
  .then((conn) => {
    console.log("✅ Connecté à MySQL via pool:", process.env.MYSQLDATABASE);
    conn.release(); // libère la connexion pour le pool
  })
  .catch((err) => {
    console.error("❌ Erreur de connexion MySQL:", err);
  });

module.exports = pool;
