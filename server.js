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

async function essaie(sql) {
  try { await pool.query(sql); } catch (e) { /* déjà appliqué ou non applicable, on continue */ }
}

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
      serveuse_id INTEGER REFERENCES serveuses(id) ON DELETE SET NULL,
      serveuse_nom TEXT NOT NULL,
      serveuse_prenom TEXT NOT NULL,
      boisson_id INTEGER REFERENCES boissons(id) ON DELETE SET NULL,
      boisson_nom TEXT NOT NULL,
      type_vente TEXT NOT NULL CHECK (type_vente IN ('bouteille','verre_petit','verre_grand')),
      quantite NUMERIC NOT NULL,
      prix_unitaire NUMERIC NOT NULL,
      total NUMERIC NOT NULL,
      modifie_par TEXT,
      cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS depenses (
      id SERIAL PRIMARY KEY,
      categorie TEXT NOT NULL,
      libelle TEXT,
      montant NUMERIC NOT NULL,
      date_depense DATE NOT NULL DEFAULT CURRENT_DATE,
      modifie_par TEXT,
      cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // --- Migration douce pour les bases créées avec une version précédente ---
  await essaie(`ALTER TABLE commandes ALTER COLUMN serveuse_id DROP NOT NULL;`);
  await essaie(`ALTER TABLE commandes ADD COLUMN IF NOT EXISTS serveuse_nom TEXT;`);
  await essaie(`ALTER TABLE commandes ADD COLUMN IF NOT EXISTS serveuse_prenom TEXT;`);
  await essaie(`UPDATE commandes c SET serveuse_nom = s.nom, serveuse_prenom = s.prenom
                FROM serveuses s WHERE c.serveuse_id = s.id AND c.serveuse_nom IS NULL;`);
  await essaie(`UPDATE commandes SET serveuse_nom = 'Ancienne', serveuse_prenom = 'serveuse' WHERE serveuse_nom IS NULL;`);
  await essaie(`ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_serveuse_id_fkey;`);
  await essaie(`ALTER TABLE commandes ADD CONSTRAINT commandes_serveuse_id_fkey FOREIGN KEY (serveuse_id) REFERENCES serveuses(id) ON DELETE SET NULL;`);
  await essaie(`ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_boisson_id_fkey;`);
  await essaie(`ALTER TABLE commandes ADD CONSTRAINT commandes_boisson_id_fkey FOREIGN KEY (boisson_id) REFERENCES boissons(id) ON DELETE SET NULL;`);

  console.log('✅ Tables prêtes (boissons, serveuses, commandes, depenses).');
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

// Suppression d'une serveuse : ses commandes passées restent (snapshot nom/prénom conservé)
app.delete('/api/serveuses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM serveuses WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e); }
});

// ===================== COMMANDES =====================

app.get('/api/commandes', async (req, res) => {
  try {
    const { serveuse_id, nom, prenom } = req.query;
    let sql = 'SELECT * FROM commandes';
    const params = [];
    const conditions = [];
    if (serveuse_id) { params.push(serveuse_id); conditions.push(`serveuse_id = $${params.length}`); }
    if (nom) { params.push(nom); conditions.push(`serveuse_nom = $${params.length}`); }
    if (prenom) { params.push(prenom); conditions.push(`serveuse_prenom = $${params.length}`); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY cree_le DESC';
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
    const { rows: sr } = await pool.query('SELECT * FROM serveuses WHERE id = $1', [serveuse_id]);
    if (sr.length === 0) return res.status(404).json({ erreur: 'Serveuse introuvable.' });
    const s = sr[0];

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
      `INSERT INTO commandes (serveuse_id, serveuse_nom, serveuse_prenom, boisson_id, boisson_nom, type_vente, quantite, prix_unitaire, total, modifie_par, cree_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now()) RETURNING *`,
      [serveuse_id, s.nom, s.prenom, boisson_id, b.nom, type_vente, quantite, prixUnitaire, total, employe || null]
    );

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

// ===================== BILANS =====================
// Résumé groupé par serveuse (y compris les serveuses supprimées, via le nom/prénom enregistrés)
app.get('/api/bilans-resume', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT serveuse_id, serveuse_nom, serveuse_prenom,
             COUNT(*) AS nombre_commandes, SUM(total) AS total
      FROM commandes
      GROUP BY serveuse_id, serveuse_nom, serveuse_prenom
      ORDER BY serveuse_nom COLLATE "C" ASC
    `);
    res.json(rows);
  } catch (e) { erreurServeur(res, e); }
});

// ===================== DEPENSES =====================

app.get('/api/depenses', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM depenses ORDER BY date_depense DESC, cree_le DESC');
    res.json(rows);
  } catch (e) { erreurServeur(res, e); }
});

app.post('/api/depenses', async (req, res) => {
  const { categorie, libelle, montant, date_depense, employe } = req.body;
  if (!categorie || montant === undefined) return res.status(400).json({ erreur: 'Catégorie et montant requis.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO depenses (categorie, libelle, montant, date_depense, modifie_par, cree_le)
       VALUES ($1,$2,$3,$4,$5, now()) RETURNING *`,
      [categorie, libelle || null, montant, date_depense || new Date().toISOString().slice(0,10), employe || null]
    );
    res.json(rows[0]);
  } catch (e) { erreurServeur(res, e); }
});

app.delete('/api/depenses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM depenses WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e); }
});

initialiserBaseDeDonnees()
  .then(() => app.listen(PORT, () => console.log(`JPA Bar — serveur lancé sur le port ${PORT}`)))
  .catch((e) => { console.error('❌ Erreur d\'initialisation :', e); process.exit(1); });
