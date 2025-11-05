const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db"); 


const SECRET_KEY = "YOUR_SECRET_KEY";


// 📌 Register a new user
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });
  }

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into database (is_active = 0 by default, waiting for admin approval)
    db.query(
      "INSERT INTO users (username, email, password, is_active) VALUES (?, ?, ?, 0)",
      [username, email, hashedPassword],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({
          message: "Utilisateur inscrit avec succès, en attente de l'approbation de l'administrateur.",
          userId: result.insertId,
        });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Approve a user (admin only)
router.put("/approve/:id", (req, res) => {
  const { id } = req.params;

  db.query(
    "UPDATE users SET is_active = 1 WHERE id_users = ?",
    [id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0)
        return res.status(404).json({ message: "Utilisateur non trouvé" });

      res.json({ message: "Utilisateur approuvé avec succès." });
    }
  );
});

// 📌 Login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    if (rows.length === 0) return res.status(404).json({ error: "Utilisateur non trouvé" });

    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ error: "Compte non approuvé" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: "Mot de passe invalide" });

    const token = jwt.sign(
      { id: user.id_users, username: user.username, is_admin: user.is_admin },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Connexion réussie",
      token,
      user: { id: user.id_users, username: user.username, is_admin: user.is_admin },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Get all users (admin use)
router.get("/users", (req, res) => {
  db.query("SELECT id_users, username, email, is_active, created_at FROM users", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});


router.get("/profile", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid token" });

    db.query("SELECT id_users, username, email, created_at FROM users WHERE id_users = ?", [decoded.id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) return res.status(404).json({ message: "Utilisateur non trouvé" });
      res.json(results[0]);
    });
  });
});

module.exports = router;
