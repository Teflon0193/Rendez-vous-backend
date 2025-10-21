const express = require("express");
const router = express.Router();
const db = require("../db");
const QRCode = require("qrcode");

// Helper function to validate time HH:MM or HH:MM:SS
const isValidTime = (time) =>
  /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(time);

// Helper function to validate date YYYY-MM-DD
const isValidDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date);

// 📌 Create a new appointment
router.post("/", async (req, res) => {
  const { nom_complet, telephone, email, raison, heure_rendez_vous, date_rendez_vous } = req.body;

  // Check required fields
  if (!nom_complet || !telephone || !raison || !heure_rendez_vous || !date_rendez_vous) {
    return res.status(400).json({ error: "Champs requis manquants" });
  }

  if (!isValidTime(heure_rendez_vous)) {
    return res.status(400).json({ error: "Format d'heure invalide (HH:MM ou HH:MM:SS)" });
  }

  if (!isValidDate(date_rendez_vous)) {
    return res.status(400).json({ error: "Format de date invalide (YYYY-MM-DD)" });
  }

  // Validate phone
  const phoneRegex = /^(\+\d{1,3})?[\s-]?\(?\d{1,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,9}$/;
  if (!phoneRegex.test(telephone)) return res.status(400).json({ error: "Format de téléphone invalide" });

  // Validate email if provided
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Format d'email invalide" });
  }

  try {
    // VÉRIFIER LE NOMBRE DE RENDEZ-VOUS POUR CETTE DATE
    const countSql = "SELECT COUNT(*) as count FROM rendezvous WHERE date_rendez_vous = ?";
    db.query(countSql, [date_rendez_vous], async (countErr, countResults) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      
      const appointmentCount = countResults[0].count;
      
      // LIMITE DE 2 RENDEZ-VOUS PAR JOUR
      if (appointmentCount >= 2) {
        return res.status(409).json({ error: "Désolé, cette date a atteint le nombre maximum de rendez-vous (2 par jour). Veuillez choisir une autre date." });
      }

      // Check if the time slot is already booked (strict match)
      const checkSql = "SELECT id FROM rendezvous WHERE date_rendez_vous = ? AND heure_rendez_vous = ?";
      db.query(checkSql, [date_rendez_vous, heure_rendez_vous], async (checkErr, checkResults) => {
        if (checkErr) return res.status(500).json({ error: checkErr.message });
        if (checkResults.length > 0) return res.status(409).json({ error: "Ce créneau est déjà réservé." });

        // Generate QR code
        const qrData = {
          nom_complet,
          telephone,
          date: date_rendez_vous,
          heure: heure_rendez_vous,
          raison: raison.substring(0, 100)
        };
        const qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
          color: { dark: "#FF0000", light: "#FFFFFF" },
          width: 300,
          margin: 2,
          errorCorrectionLevel: 'H'
        });

        // Insert into DB
        const insertSql = `
          INSERT INTO rendezvous (nom_complet, telephone, email, raison, heure_rendez_vous, date_rendez_vous, qr_code)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        db.query(insertSql, [nom_complet, telephone, email, raison, heure_rendez_vous, date_rendez_vous, qrCodeUrl], (err, result) => {
          if (err) return res.status(500).json({ error: err.message });
          res.status(201).json({ message: "Rendez-vous créé avec succès", id: result.insertId, qr_code: qrCodeUrl });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// 📌 Verify an appointment
router.post("/verify", (req, res) => {
  let { id } = req.body;
  
  // Si l'ID est un JSON stringifié, le parser
  try {
    if (id && typeof id === 'string' && id.startsWith('{')) {
      const qrData = JSON.parse(id);
      id = qrData.id || qrData.date || qrData.nom_complet; // Essayez différents champs
    }
  } catch (e) {
    console.log("Impossible de parser l'ID comme JSON, utilisation directe");
  }

  if (!id) {
    return res.status(400).json({ 
      error: "ID du rendez-vous requis",
      received: req.body 
    });
  }

  console.log("Vérification du rendez-vous avec ID:", id);

  db.query("SELECT * FROM rendezvous WHERE id = ?", [id], (err, results) => {
    if (err) {
      console.error("Erreur DB:", err);
      return res.status(500).json({ error: err.message });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ 
        message: "Rendez-vous non trouvé",
        searchedId: id 
      });
    }

    const rendezvous = results[0];
    
    // Mettre à jour le statut
    db.query("UPDATE rendezvous SET statut = 'Verifie' WHERE id = ?", [id], (updateErr) => {
      if (updateErr) {
        console.error("Erreur update:", updateErr);
        return res.status(500).json({ error: updateErr.message });
      }
      
      res.json({ 
        message: "Rendez-vous vérifié ✅", 
        nom_complet: rendezvous.nom_complet,
        raison: rendezvous.raison,
        date: rendezvous.date_rendez_vous,
        heure: rendezvous.heure_rendez_vous,
        statut: "Verifie"
      });
    });
  });
});



// 📌 List appointments with pagination
router.get("/", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  db.query("SELECT COUNT(*) as total FROM rendezvous", (countErr, countResults) => {
    if (countErr) return res.status(500).json({ error: countErr.message });

    const total = countResults[0].total;
    const totalPages = Math.ceil(total / limit);

    db.query("SELECT * FROM rendezvous ORDER BY date_rendez_vous DESC, heure_rendez_vous DESC LIMIT ? OFFSET ?", [limit, offset], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ data: results, pagination: { currentPage: page, totalPages, totalItems: total, itemsPerPage: limit } });
    });
  });
});


// 📌 Get booked dates with their hours (for frontend blocking)
router.get("/booked-dates", (req, res) => {
  
  const query = `
    SELECT 
      DATE_FORMAT(date_rendez_vous, '%Y-%m-%d') AS date, 
      GROUP_CONCAT(heure_rendez_vous ORDER BY heure_rendez_vous ASC) AS heures,
      COUNT(*) as count
    FROM rendezvous 
    GROUP BY date_rendez_vous
    HAVING count >= 2  -- Retourne seulement les dates avec 2 rendez-vous ou plus
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Erreur /booked-dates:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération des dates réservées" });
    }

    const formatted = results.map(row => {
      return {
        date: row.date,
        heures: row.heures ? row.heures.split(",") : [],
        full: true  // Indique que la date est complète (2 rendez-vous)
      };
    });

    res.json(formatted);
  });
});


// 📌 Get dates with available slots (pour le frontend)
router.get("/available-dates", (req, res) => {
  
  const query = `
    SELECT 
      DATE_FORMAT(date_rendez_vous, '%Y-%m-%d') AS date, 
      COUNT(*) as appointment_count
    FROM rendezvous 
    GROUP BY date_rendez_vous
    HAVING appointment_count < 2  -- Dates avec moins de 2 rendez-vous
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Erreur /available-dates:", err);
      return res.status(500).json({ error: "Erreur lors de la récupération des dates disponibles" });
    }

    const availableDates = results.map(row => ({
      date: row.date,
      remainingSlots: 2 - row.appointment_count  // Nombre de créneaux restants
    }));

    res.json(availableDates);
  });
});


// 📌 Get appointment by ID
router.get("/:id", (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM rendezvous WHERE id = ?", [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ message: "Rendez-vous non trouvé" });
    res.json(results[0]);
  });
});


// 📌 Update an appointment
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const { nom_complet, telephone, email, raison, heure_rendez_vous, date_rendez_vous, statut } = req.body;

  db.query("SELECT * FROM rendezvous WHERE id = ?", [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ message: "Rendez-vous non trouvé" });

    // Si la date change, vérifier la limite
    if (date_rendez_vous && date_rendez_vous !== results[0].date_rendez_vous) {
      const countSql = "SELECT COUNT(*) as count FROM rendezvous WHERE date_rendez_vous = ?";
      db.query(countSql, [date_rendez_vous], (countErr, countResults) => {
        if (countErr) return res.status(500).json({ error: countErr.message });
        
        const appointmentCount = countResults[0].count;
        if (appointmentCount >= 2) {
          return res.status(409).json({ error: "La nouvelle date a atteint le nombre maximum de rendez-vous (2 par jour)." });
        }

        proceedWithUpdate();
      });
    } else {
      proceedWithUpdate();
    }

    function proceedWithUpdate() {
      if (heure_rendez_vous && !isValidTime(heure_rendez_vous)) {
        return res.status(400).json({ error: "Format d'heure invalide" });
      }

      const updateFields = [];
      const values = [];

      if (nom_complet) { updateFields.push("nom_complet = ?"); values.push(nom_complet); }
      if (telephone) { updateFields.push("telephone = ?"); values.push(telephone); }
      if (email !== undefined) { updateFields.push("email = ?"); values.push(email); }
      if (raison) { updateFields.push("raison = ?"); values.push(raison); }
      if (heure_rendez_vous) { updateFields.push("heure_rendez_vous = ?"); values.push(heure_rendez_vous); }
      if (date_rendez_vous) { updateFields.push("date_rendez_vous = ?"); values.push(date_rendez_vous); }
      if (statut) { updateFields.push("statut = ?"); values.push(statut); }

      if (updateFields.length === 0) return res.status(400).json({ error: "Aucun champ à mettre à jour" });

      values.push(id);
      const sql = `UPDATE rendezvous SET ${updateFields.join(", ")} WHERE id = ?`;
      db.query(sql, values, (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        res.json({ message: "Rendez-vous mis à jour avec succès" });
      });
    }
  });
});


// 📌 Delete appointment
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM rendezvous WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ message: "Rendez-vous non trouvé" });
    res.json({ message: "Rendez-vous supprimé avec succès" });
  });
});


// 📌 Get booked slots for a specific date
router.get("/booked-slots/:date", async (req, res) => {
  try {
    const { date } = req.params;
    
    // Use the promise wrapper
    const [rows] = await db.promise().query(
      "SELECT heure_rendez_vous FROM rendezvous WHERE date_rendez_vous = ? ORDER BY heure_rendez_vous ASC",
      [date]
    );
    
    res.json(rows.map(r => r.heure_rendez_vous));
  } catch (err) {
    console.error("Erreur /booked-slots:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});


module.exports = router;