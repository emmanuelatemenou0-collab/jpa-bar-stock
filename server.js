const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.warn('⚠️  Aucune variable DATABASE_URL trouvée.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

async function initialiserBaseDeDonnees() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS boissons (
      id SERIAL PRIMARY KEY,
      categorie TEXT NOT NULL CHECK (categorie IN ('sobebras','vin','whisky','autre')),
      nom TEXT NOT NULL,
      taille TEXT CHECK (taille IN ('petite','grande')),
      unites_par_carton INTEGER,
      prix_achat_carton NUMERIC,
      prix_achat_unite NUMERIC,
      prix_vente_bouteille NUMERIC NOT NULL DEFAULT 0,
      prix_vente_verre_petit NUMERIC,
      prix_vente_verre_grand NUMERIC,
      stock_bouteilles NUMERIC NOT NULL DEFAULT 0,
      seuil NUMERIC NOT NULL DEFAULT 6,
      modifie_par TEXT,
      modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS serveuses (
      id SERIAL PRIMARY KEY,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      modifie_par TEXT,
      modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS commandes (
      id SERIAL PRIMARY KEY,
      serveuse_id INTEGER NOT NULL REFERENCES serveuses(id) ON DELETE CASCADE,
      boisson_id INTEGER NOT NULL REFERENCES boissons(id) ON DELETE CASCADE,
      boisson_nom TEXT NOT NULL,
      type_vente TEXT NOT NULL CHECK (type_vente IN ('bouteille','verre_petit','verre_grand')),
      quantite NUMERIC NOT NULL,
      prix_unitaire NUMERIC NOT NULL,
      total NUMERIC NOT NULL,
      modifie_par TEXT,
      cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('✅ Tables prêtes (boissons, serveuses, commandes).');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function erreurServeur(res, e) {
  console.error(e);
  res.status(500).json({ erreur: 'Erreur serveur' });
}

// ===================== BOISSONS =====================

app.get('/api/boissons', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM boissons ORDER BY categorie, nom COLLATE "C" ASC');
    res.json(rows);
  } catch (e) { erreurServeur(res, e); }
});

app.post('/api/boissons', async (req, res) => {
  const {
    categorie, nom, taille, unites_par_carton, prix_achat_carton,
    prix_achat_unite, prix_vente_bouteille, prix_vente_verre_petit,
    prix_vente_verre_grand, stock_bouteilles, seuil, employe
  } = req.body;
  if (!categorie || !nom) return res.status(400).json({ erreur: 'Catégorie et nom requis.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO boissons
        (categorie, nom, taille, unites_par_carton, prix_achat_carton, prix_achat_unite,
         prix_vente_bouteille, prix_vente_verre_petit, prix_vente_verre_grand,
         stock_bouteilles, seuil, modifie_par, modifie_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now()) RETURNING *`,
      [categorie, nom, taille || null, unites_par_carton || null, prix_achat_carton || null,
       prix_achat_unite || null, prix_vente_bouteille || 0, prix_vente_verre_petit || null,
       prix_vente_verre_grand || null, stock_bouteilles || 0, seuil ?? 6, employe || null]
    );
    res.json(rows[0]);
  } catch (e) { erreurServeur(res, e); }
});

app.patch('/api/boissons/:id', async (req, res) => {
  const { stock_bouteilles, employe } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE boissons SET stock_bouteilles = $1, modifie_par = $2, modifie_le = now()
       WHERE id = $3 RETURNING *`,
      [Math.max(0, stock_bouteilles), employe || null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ erreur: 'Boisson introuvable.' });
    res.json(rows[0]);
  } catch (e) { erreurServeur(res, e); }
});

app.delete('/api/boissons/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM boissons WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e); }
});

// ===================== SERVEUSES =====================

app.get('/api/serveuses', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM serveuses ORDER BY nom COLLATE "C" ASC');
    res.json(rows);
  } catch (e) { erreurServeur(res, e); }
});

app.post('/api/serveuses', async (req, res) => {
  const { nom, prenom, employe } = req.body;
  if (!nom || !prenom) return res.status(400).json({ erreur: 'Nom et prénom requis.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO serveuses (nom, prenom, modifie_par, modifie_le) VALUES ($1,$2,$3, now()) RETURNING *`,
      [nom, prenom, employe || null]
    );
    res.json(rows[0]);
  } catch (e) { erreurServeur(res, e); }
});

app.delete('/api/serveuses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM serveuses WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e); }
});

// ===================== COMMANDES =====================

app.get('/api/commandes', async (req, res) => {
  try {
    const { serveuse_id } = req.query;
    let sql = `SELECT c.*, s.nom AS serveuse_nom, s.prenom AS serveuse_prenom
               FROM commandes c JOIN serveuses s ON s.id = c.serveuse_id`;
    const params = [];
    if (serveuse_id) {
      sql += ' WHERE c.serveuse_id = $1';
      params.push(serveuse_id);
    }
    sql += ' ORDER BY c.cree_le DESC';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { erreurServeur(res, e); }
});

app.post('/api/commandes', async (req, res) => {
  const { serveuse_id, boisson_id, type_vente, quantite, employe } = req.body;
  if (!serveuse_id || !boisson_id || !type_vente || !quantite) {
    return res.status(400).json({ erreur: 'Champs requis manquants.' });
  }
  try {
    const { rows: br } = await pool.query('SELECT * FROM boissons WHERE id = $1', [boisson_id]);
    if (br.length === 0) return res.status(404).json({ erreur: 'Boisson introuvable.' });
    const b = br[0];

    let prixUnitaire;
    if (type_vente === 'bouteille') prixUnitaire = Number(b.prix_vente_bouteille || 0);
    else if (type_vente === 'verre_petit') prixUnitaire = Number(b.prix_vente_verre_petit || 0);
    else if (type_vente === 'verre_grand') prixUnitaire = Number(b.prix_vente_verre_grand || 0);
    else return res.status(400).json({ erreur: 'Type de vente invalide.' });

    const total = prixUnitaire * Number(quantite);

    const { rows } = await pool.query(
      `INSERT INTO commandes (serveuse_id, boisson_id, boisson_nom, type_vente, quantite, prix_unitaire, total, modifie_par, cree_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now()) RETURNING *`,
      [serveuse_id, boisson_id, b.nom, type_vente, quantite, prixUnitaire, total, employe || null]
    );

    // On ne déduit le stock que pour les ventes à la bouteille (pas pour les verres,
    // car une bouteille ouverte au verre n'est pas suivie unité par unité ici)
    if (type_vente === 'bouteille') {
      await pool.query(
        'UPDATE boissons SET stock_bouteilles = GREATEST(0, stock_bouteilles - $1) WHERE id = $2',
        [quantite, boisson_id]
      );
    }

    res.json(rows[0]);
  } catch (e) { erreurServeur(res, e); }
});

app.delete('/api/commandes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM commandes WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e); }
});

// ===================== BILAN =====================

app.get('/api/bilan/:serveuse_id', async (req, res) => {
  try {
    const { rows: commandes } = await pool.query(
      `SELECT c.*, s.nom AS serveuse_nom, s.prenom AS serveuse_prenom
       FROM commandes c JOIN serveuses s ON s.id = c.serveuse_id
       WHERE c.serveuse_id = $1 ORDER BY c.cree_le ASC`,
      [req.params.serveuse_id]
    );
    const total = commandes.reduce((s, c) => s + Number(c.total), 0);
    res.json({ commandes, total });
  } catch (e) { erreurServeur(res, e); }
});

initialiserBaseDeDonnees()
  .then(() => app.listen(PORT, () => console.log(`JPA Bar — serveur lancé sur le port ${PORT}`)))
  .catch((e) => { console.error('❌ Erreur d\'initialisation :', e); process.exit(1); });
