const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "votre_secret_jwt_super_securise_dg_2025";

// 📌 Inscription DG (création de compte)
router.post("/register", async (req, res) => {
  const { nom, prenom, email, mot_de_passe, telephone } = req.body;

  if (!nom || !prenom || !email || !mot_de_passe) {
    return res.status(400).json({
      error: "Nom, prénom, email et mot de passe requis",
    });
  }

  try {
    // Vérifier si l'email existe déjà
    const [existing] = await db.query(
      "SELECT id FROM directeurs_general WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: "Cet email est déjà utilisé" });
    }

    // Hasher le mot de passe
    const motDePasseHash = await bcrypt.hash(mot_de_passe, 10);

    // Insérer le nouveau DG
    const [result] = await db.query(
      `INSERT INTO directeurs_general (nom, prenom, email, mot_de_passe, telephone) 
       VALUES (?, ?, ?, ?, ?)`,
      [nom, prenom, email, motDePasseHash, telephone || null]
    );

    res.status(201).json({
      message: "Compte Directeur Général créé avec succès",
      dg_id: result.insertId,
      nom,
      prenom,
      email,
    });
  } catch (error) {
    console.error("Erreur inscription:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// 📌 Login DG
router.post("/login", async (req, res) => {
  const { email, mot_de_passe } = req.body;

  if (!email || !mot_de_passe) {
    return res.status(400).json({ error: "Email et mot de passe requis" });
  }

  try {
    const [results] = await db.query(
      "SELECT * FROM directeurs_general WHERE email = ? AND statut = 'actif'",
      [email]
    );

    if (results.length === 0) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const dg = results[0];
    const motDePasseValide = await bcrypt.compare(mot_de_passe, dg.mot_de_passe);

    if (!motDePasseValide) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    // Générer le token JWT
    const token = jwt.sign(
      {
        dg_id: dg.id,
        email: dg.email,
        nom: dg.nom,
        prenom: dg.prenom,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const { mot_de_passe: _, ...dgSansMotDePasse } = dg;

    res.json({
      message: "Connexion réussie",
      token,
      dg: dgSansMotDePasse,
    });
  } catch (error) {
    console.error("Erreur connexion:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
