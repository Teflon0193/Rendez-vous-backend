const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",        
  password: "root",      
  database: "rendezvous_db"
});

db.connect((err) => {
  if (err) {
    console.error("Erreur de connexion MySQL:", err);
    return;
  }
  console.log("✅ Connecté à MySQL");
});

module.exports = db;
