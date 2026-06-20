const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Connexion PostgreSQL ---
// DATABASE_URL est fournie automatiquement par Render quand tu relies
// le service web à une base PostgreSQL Render.
if (!process.env.DATABASE_URL) {
  console.warn('⚠️  Aucune variable DATABASE_URL trouvée. Définis-la avant de démarrer le serveur.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

// --- Création des tables si elles n'existent pas encore ---
async function initialiserBaseDeDonnees() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS boissons (
      id SERIAL PRIMARY KEY,
      nom TEXT NOT NULL,
      bouteilles INTEGER NOT NULL DEFAULT 0,
      seuil INTEGER NOT NULL DEFAULT 6,
      modifie_par TEXT,
      modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id SERIAL PRIMARY KEY,
      nom TEXT NOT NULL,
      quantite NUMERIC NOT NULL DEFAULT 0,
      unite TEXT,
      seuil NUMERIC NOT NULL DEFAULT 2,
      modifie_par TEXT,
      modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('✅ Tables prêtes (boissons, ingredients).');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===================== BOISSONS =====================

app.get('/api/boissons', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM boissons ORDER BY nom COLLATE "C" ASC'
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

app.post('/api/boissons', async (req, res) => {
  const { nom, bouteilles, seuil, employe } = req.body;
  if (!nom || bouteilles === undefined) {
    return res.status(400).json({ erreur: 'Nom et nombre de bouteilles requis.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO boissons (nom, bouteilles, seuil, modifie_par, modifie_le)
       VALUES ($1, $2, $3, $4, now()) RETURNING *`,
      [nom, bouteilles, seuil ?? 6, employe || null]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

app.patch('/api/boissons/:id', async (req, res) => {
  const { bouteilles, employe } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE boissons SET bouteilles = $1, modifie_par = $2, modifie_le = now()
       WHERE id = $3 RETURNING *`,
      [Math.max(0, bouteilles), employe || null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ erreur: 'Boisson introuvable.' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

app.delete('/api/boissons/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM boissons WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

// ===================== INGREDIENTS =====================

app.get('/api/ingredients', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ingredients ORDER BY nom COLLATE "C" ASC'
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

app.post('/api/ingredients', async (req, res) => {
  const { nom, quantite, unite, seuil, employe } = req.body;
  if (!nom || quantite === undefined) {
    return res.status(400).json({ erreur: 'Nom et quantité requis.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO ingredients (nom, quantite, unite, seuil, modifie_par, modifie_le)
       VALUES ($1, $2, $3, $4, $5, now()) RETURNING *`,
      [nom, quantite, unite || null, seuil ?? 2, employe || null]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

app.patch('/api/ingredients/:id', async (req, res) => {
  const { quantite, employe } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE ingredients SET quantite = $1, modifie_par = $2, modifie_le = now()
       WHERE id = $3 RETURNING *`,
      [Math.max(0, quantite), employe || null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ erreur: 'Ingrédient introuvable.' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

app.delete('/api/ingredients/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ingredients WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

// --- Démarrage ---
initialiserBaseDeDonnees()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`JPA Bar — serveur de stock lancé sur le port ${PORT}`);
    });
  })
  .catch((e) => {
    console.error('❌ Impossible d\'initialiser la base de données :', e);
    process.exit(1);
  });
