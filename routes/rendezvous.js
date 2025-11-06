const express = require("express");
const router = express.Router();
const db = require("../db");
const QRCode = require("qrcode");

// Helper function to validate time HH:MM or HH:MM:SS
const isValidTime = (time) =>
  /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(time);

// Helper function to validate date YYYY-MM-DD
const isValidDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date);

// ---------------------------
// Create a new appointment
// ---------------------------
router.post("/", async (req, res) => {
  const { nom_complet, telephone, email, raison, heure_rendez_vous, date_rendez_vous } = req.body;

  if (!nom_complet || !telephone || !raison || !heure_rendez_vous || !date_rendez_vous) {
    return res.status(400).json({ error: "Champs requis manquants" });
  }

  if (!isValidTime(heure_rendez_vous)) return res.status(400).json({ error: "Format d'heure invalide" });
  if (!isValidDate(date_rendez_vous)) return res.status(400).json({ error: "Format de date invalide" });

  const phoneRegex = /^(\+\d{1,3})?[\s-]?\(?\d{1,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,9}$/;
  if (!phoneRegex.test(telephone)) return res.status(400).json({ error: "Format de téléphone invalide" });

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Format d'email invalide" });
  }

  try {
    // Check number of appointments on this date
    const [[{ count: appointmentCount }]] = await db.query(
      "SELECT COUNT(*) AS count FROM rendezvous WHERE date_rendez_vous = ?",
      [date_rendez_vous]
    );

    if (appointmentCount >= 2) {
      return res.status(409).json({ error: "Cette date a atteint le nombre maximum de rendez-vous (2 par jour)." });
    }

    // Check if time slot is already booked
    const [existing] = await db.query(
      "SELECT id FROM rendezvous WHERE date_rendez_vous = ? AND heure_rendez_vous = ?",
      [date_rendez_vous, heure_rendez_vous]
    );
    if (existing.length > 0) return res.status(409).json({ error: "Ce créneau est déjà réservé." });

    // Generate QR code
    const qrData = { nom_complet, telephone, date: date_rendez_vous, heure: heure_rendez_vous, raison: raison.substring(0, 100) };
    const qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
      color: { dark: "#FF0000", light: "#FFFFFF" },
      width: 300,
      margin: 2,
      errorCorrectionLevel: "H",
    });

    // Insert appointment
    const [result] = await db.query(
      `INSERT INTO rendezvous (nom_complet, telephone, email, raison, heure_rendez_vous, date_rendez_vous, qr_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nom_complet, telephone, email, raison, heure_rendez_vous, date_rendez_vous, qrCodeUrl]
    );

    res.status(201).json({ message: "Rendez-vous créé avec succès", id: result.insertId, qr_code: qrCodeUrl });

  } catch (err) {
    console.error("Erreur création rendez-vous:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// Verify an appointment
// ---------------------------
// ✅ Vérification du rendez-vous
router.post("/verify", async (req, res) => {
  let { id, date, nom_complet } = req.body;

  console.log("=== REQUÊTE VERIFY ===");
  console.log("Body reçu:", req.body);

  // 🔍 Si l'ID est une date, utiliser comme critère de recherche
  if (id && id.match(/^\d{4}-\d{2}-\d{2}$/)) {
    date = id;
    id = null;
  }

  if (!id && !date && !nom_complet) {
    return res.status(400).json({
      error: "ID, date ou nom_complet requis",
      received: req.body
    });
  }

  let sql = "SELECT * FROM rendezvous WHERE ";
  const params = [];

  if (id) {
    sql += "id = ?";
    params.push(id);
  } else if (date && nom_complet) {
    sql += "date_rendez_vous = ? AND nom_complet LIKE ?";
    params.push(date, `%${nom_complet}%`);
  } else if (date) {
    sql += "date_rendez_vous = ?";
    params.push(date);
  } else if (nom_complet) {
    sql += "nom_complet LIKE ?";
    params.push(`%${nom_complet}%`);
  }

  console.log("🔍 Requête SQL:", sql, "Params:", params);

  try {
    const [results] = await db.query(sql, params);
    console.log("📊 Résultats trouvés:", results.length);

    if (results.length === 0) {
      return res.status(404).json({
        message: "Aucun rendez-vous trouvé",
        critere: { id, date, nom_complet }
      });
    }

    const rendezvous = results[0];
    console.log("✅ Rendez-vous trouvé:", rendezvous.nom_complet);

    // ⚠️ Déjà vérifié ?
    if (rendezvous.statut === "Verifie") {
      return res.json({
        message: "⚠️ Déjà vérifié",
        nom_complet: rendezvous.nom_complet,
        raison: rendezvous.raison,
        date: rendezvous.date_rendez_vous,
        heure: rendezvous.heure_rendez_vous,
        statut: "Verifie",
        deja_verifie: true
      });
    }

    // ✅ Générer le QR code vert
    const qrData = {
      id: rendezvous.id,
      nom_complet: rendezvous.nom_complet,
      date: rendezvous.date_rendez_vous,
      heure: rendezvous.heure_rendez_vous,
      raison: rendezvous.raison,
      statut: "VERIFIE",
      verifie_le: new Date().toISOString()
    };

    const qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
      color: {
        dark: "#00ff0081",
        light: "#FFFFFF"
      },
      width: 300,
      margin: 2,
      errorCorrectionLevel: "H"
    });

    // ✅ Mise à jour du statut et du QR code
    await db.query(
      "UPDATE rendezvous SET statut = 'Verifie', qr_code = ? WHERE id = ?",
      [qrCodeUrl, rendezvous.id]
    );

    console.log("✅ Statut et QR code mis à jour pour ID:", rendezvous.id);

    res.json({
      message: "Rendez-vous vérifié ✅",
      nom_complet: rendezvous.nom_complet,
      raison: rendezvous.raison,
      date: rendezvous.date_rendez_vous,
      heure: rendezvous.heure_rendez_vous,
      statut: "Verifie",
      qr_code_vert: qrCodeUrl
    });

  } catch (error) {
    console.error("❌ Erreur serveur:", error);
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
});

// ---------------------------
// List appointments with pagination
// ---------------------------
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM rendezvous");
    const totalPages = Math.ceil(total / limit);

    const [results] = await db.query(
      "SELECT * FROM rendezvous ORDER BY date_rendez_vous DESC, heure_rendez_vous DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );

    res.json({ data: results, pagination: { currentPage: page, totalPages, totalItems: total, itemsPerPage: limit } });

  } catch (err) {
    console.error("Erreur listing rendez-vous:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// Get appointment by ID
// ---------------------------
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [results] = await db.query("SELECT * FROM rendezvous WHERE id = ?", [id]);
    if (results.length === 0) return res.status(404).json({ message: "Rendez-vous non trouvé" });
    res.json(results[0]);
  } catch (err) {
    console.error("Erreur get rendez-vous:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// Update an appointment
// ---------------------------
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { nom_complet, telephone, email, raison, heure_rendez_vous, date_rendez_vous, statut } = req.body;

  try {
    const [existing] = await db.query("SELECT * FROM rendezvous WHERE id = ?", [id]);
    if (existing.length === 0) return res.status(404).json({ message: "Rendez-vous non trouvé" });

    // Check date limit if date changed
    if (date_rendez_vous && date_rendez_vous !== existing[0].date_rendez_vous) {
      const [[{ count }]] = await db.query("SELECT COUNT(*) AS count FROM rendezvous WHERE date_rendez_vous = ?", [date_rendez_vous]);
      if (count >= 2) {
        return res.status(409).json({ error: "La nouvelle date a atteint le nombre maximum de rendez-vous (2 par jour)." });
      }
    }

    if (heure_rendez_vous && !isValidTime(heure_rendez_vous)) return res.status(400).json({ error: "Format d'heure invalide" });

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
    await db.query(sql, values);
    res.json({ message: "Rendez-vous mis à jour avec succès" });

  } catch (err) {
    console.error("Erreur update rendez-vous:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// Delete appointment
// ---------------------------
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM rendezvous WHERE id = ?", [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "Rendez-vous non trouvé" });
    res.json({ message: "Rendez-vous supprimé avec succès" });
  } catch (err) {
    console.error("Erreur delete rendez-vous:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// Get booked slots for a specific date
// ---------------------------
router.get("/booked-slots/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const [rows] = await db.query(
      "SELECT heure_rendez_vous FROM rendezvous WHERE date_rendez_vous = ? ORDER BY heure_rendez_vous ASC",
      [date]
    );
    res.json(rows.map(r => r.heure_rendez_vous));
  } catch (err) {
    console.error("Erreur /booked-slots:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// Get booked dates
// ---------------------------
router.get("/booked-dates", async (req, res) => {
  try {
    const query = `
      SELECT 
        DATE_FORMAT(date_rendez_vous, '%Y-%m-%d') AS date, 
        GROUP_CONCAT(heure_rendez_vous ORDER BY heure_rendez_vous ASC) AS heures,
        COUNT(*) as count
      FROM rendezvous 
      GROUP BY date_rendez_vous
      HAVING count >= 2
    `;
    const [results] = await db.query(query);

    const formatted = results.map(row => ({
      date: row.date,
      heures: row.heures ? row.heures.split(",") : [],
      full: row.count >= 2,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Erreur /booked-dates:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// Get available dates
// ---------------------------
router.get("/available-dates", async (req, res) => {
  try {
    const query = `
      SELECT 
        DATE_FORMAT(date_rendez_vous, '%Y-%m-%d') AS date, 
        COUNT(*) as appointment_count
      FROM rendezvous 
      GROUP BY date_rendez_vous
      HAVING appointment_count < 2
    `;
    const [results] = await db.query(query);
    const availableDates = results.map(row => ({
      date: row.date,
      remainingSlots: 2 - row.appointment_count
    }));
    res.json(availableDates);
  } catch (err) {
    console.error("Erreur /available-dates:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
