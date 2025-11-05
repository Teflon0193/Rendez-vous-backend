const express = require("express");
const router = express.Router();
const db = require("../db"); // promise-based pool
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const SECRET_KEY = "YOUR_SECRET_KEY";

// ---------------------------
// Register a new user
// ---------------------------
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      "INSERT INTO users (username, email, password, is_active) VALUES (?, ?, ?, 0)",
      [username, email, hashedPassword]
    );

    res.status(201).json({
      message: "Utilisateur inscrit avec succès, en attente de l'approbation de l'administrateur.",
      userId: result.insertId,
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// Approve a user (admin only)
// ---------------------------
router.put("/approve/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query(
      "UPDATE users SET is_active = 1 WHERE id_users = ?",
      [id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Utilisateur non trouvé" });

    res.json({ message: "Utilisateur approuvé avec succès." });

  } catch (err) {
    console.error("Approve user error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// Login
// ---------------------------
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
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

// ---------------------------
// Get all users (admin)
// ---------------------------
router.get("/users", async (req, res) => {
  try {
    const [results] = await db.query("SELECT id_users, username, email, is_active, created_at FROM users");
    res.json(results);
  } catch (err) {
    console.error("Get users error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// Get profile from token
// ---------------------------
router.get("/profile", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const [results] = await db.query(
      "SELECT id_users, username, email, created_at FROM users WHERE id_users = ?",
      [decoded.id]
    );

    if (results.length === 0) return res.status(404).json({ message: "Utilisateur non trouvé" });
    res.json(results[0]);

  } catch (err) {
    console.error("Profile error:", err);
    res.status(403).json({ message: "Invalid token" });
  }
});

module.exports = router;
