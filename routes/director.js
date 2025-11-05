const express = require("express");
const router = express.Router();
const db = require("../db"); // promise-based pool

// ✅ Liste des rendez-vous pour le Directeur Général
router.get("/appointments", async (req, res) => {
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

  try {
    const [results] = await db.query(sql);
    res.json(results);
  } catch (err) {
    console.error("Erreur MySQL:", err);
    res.status(500).json({ error: "Erreur lors du chargement des rendez-vous" });
  }
});

module.exports = router;
