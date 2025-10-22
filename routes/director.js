const express = require("express");
const router = express.Router();
const db = require("../db");

// ✅ Liste des rendez-vous pour le Directeur Général
router.get("/appointments", (req, res) => {
  const sql = `
    SELECT 
      id, 
      nom_complet AS visitor_name, 
      raison AS subject, 
      date_rendez_vous AS date, 
      heure_rendez_vous AS time, 
      statut AS status 
    FROM rendezvous
    ORDER BY date_rendez_vous DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Erreur MySQL:", err);
      return res.status(500).json({ error: "Erreur lors du chargement des rendez-vous" });
    }
    res.json(results);
  });
});

module.exports = router;
