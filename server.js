const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET non défini : les connexions seront coupées à chaque redémarrage du serveur. Ajoute une variable d\'environnement SESSION_SECRET sur Render (n\'importe quelle longue chaîne aléatoire).');
}

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
  try { await pool.query(sql); } catch (e) { /* déjà appliqué ou non applicable */ }
}

// ===================== MOTS DE PASSE & SESSIONS =====================

function hacherMotDePasse(motDePasse) {
  const sel = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(motDePasse, sel, 64).toString('hex');
  return sel + ':' + hash;
}
function verifierMotDePasse(motDePasse, stocke) {
  const [sel, hash] = stocke.split(':');
  if (!sel || !hash) return false;
  const essai = crypto.scryptSync(motDePasse, sel, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(essai, 'hex'));
}
function signerValeur(valeur) {
  const sig = crypto.createHmac('sha256', SECRET).update(valeur).digest('hex');
  return valeur + '.' + sig;
}
function lireValeurSignee(cookieVal) {
  if (!cookieVal) return null;
  const idx = cookieVal.lastIndexOf('.');
  if (idx < 0) return null;
  const valeur = cookieVal.slice(0, idx);
  const sig = cookieVal.slice(idx + 1);
  const attendu = crypto.createHmac('sha256', SECRET).update(valeur).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(attendu, 'hex'))) return null;
  } catch (e) { return null; }
  return valeur;
}

async function exigerConnexion(req, res, next) {
  const brut = lireValeurSignee(req.cookies && req.cookies.jpa_session);
  if (!brut) return res.status(401).json({ erreur: 'Connexion requise.' });
  let session;
  try {
    session = JSON.parse(Buffer.from(brut, 'base64').toString('utf-8'));
  } catch (e) {
    return res.status(401).json({ erreur: 'Session invalide.' });
  }
  // Sécurité essentielle : on revérifie en base à CHAQUE requête que le compte
  // existe toujours et est actif. Ainsi, désactiver/supprimer un compte coupe
  // l'accès immédiatement, même si la personne a une session déjà ouverte.
  try {
    const { rows } = await pool.query('SELECT * FROM utilisateurs WHERE id = $1', [session.id]);
    if (rows.length === 0 || !rows[0].actif) {
      res.clearCookie('jpa_session');
      return res.status(401).json({ erreur: 'Accès révoqué.' });
    }
    const u = rows[0];
    req.utilisateur = { id: u.id, role: u.role, nom: u.nom, prenom: u.prenom, serveuse_id: u.serveuse_id };
    next();
  } catch (e) {
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
}
function exigerRole(...roles) {
  return (req, res, next) => {
    if (!req.utilisateur || !roles.includes(req.utilisateur.role)) {
      return res.status(403).json({ erreur: 'Accès non autorisé pour ce rôle.' });
    }
    next();
  };
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS retours (
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
    CREATE TABLE IF NOT EXISTS utilisateurs (
      id SERIAL PRIMARY KEY,
      nom_utilisateur TEXT UNIQUE NOT NULL,
      mot_de_passe TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','gerant','serveuse')),
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      serveuse_id INTEGER REFERENCES serveuses(id) ON DELETE SET NULL,
      actif BOOLEAN NOT NULL DEFAULT true,
      modifie_par TEXT,
      modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

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

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM utilisateurs');
  if (rows[0].n === 0) {
    const nomUtilisateur = process.env.ADMIN_USERNAME || 'admin';
    const motDePasse = process.env.ADMIN_PASSWORD || 'changeme123';
    await pool.query(
      `INSERT INTO utilisateurs (nom_utilisateur, mot_de_passe, role, nom, prenom, actif)
       VALUES ($1,$2,'admin','Administrateur','Compte', true)`,
      [nomUtilisateur, hacherMotDePasse(motDePasse)]
    );
    console.log(`👑 Compte admin créé : identifiant "${nomUtilisateur}". ${process.env.ADMIN_PASSWORD ? '' : 'Mot de passe par défaut "changeme123" — CHANGE-LE immédiatement après ta première connexion.'}`);
  }

  console.log('✅ Tables prêtes (boissons, serveuses, commandes, depenses, utilisateurs).');
}

app.use(express.json());
app.use(cookieParser());

function erreurServeur(res, e) {
  console.error(e);
  res.status(500).json({ erreur: 'Erreur serveur' });
}

// ===================== CONNEXION =====================

app.post('/api/connexion', async (req, res) => {
  const { nom_utilisateur, mot_de_passe } = req.body;
  if (!nom_utilisateur || !mot_de_passe) return res.status(400).json({ erreur: 'Identifiant et mot de passe requis.' });
  try {
    const { rows } = await pool.query('SELECT * FROM utilisateurs WHERE nom_utilisateur = $1', [nom_utilisateur]);
    if (rows.length === 0 || !rows[0].actif || !verifierMotDePasse(mot_de_passe, rows[0].mot_de_passe)) {
      return res.status(401).json({ erreur: 'Identifiant ou mot de passe incorrect.' });
    }
    const u = rows[0];
    const session = { id: u.id, role: u.role, nom: u.nom, prenom: u.prenom, serveuse_id: u.serveuse_id };
    const valeur = Buffer.from(JSON.stringify(session)).toString('base64');
    res.cookie('jpa_session', signerValeur(valeur), {
      httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 1000 * 60 * 60 * 24 * 30,
    });
    res.json(session);
  } catch (e) { erreurServeur(res, e); }
});

app.post('/api/deconnexion', (req, res) => {
  res.clearCookie('jpa_session');
  res.json({ ok: true });
});

app.get('/api/moi', exigerConnexion, (req, res) => res.json(req.utilisateur));

app.use('/api', exigerConnexion);

// ===================== UTILISATEURS (admin uniquement) =====================

app.get('/api/utilisateurs', exigerRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nom_utilisateur, role, nom, prenom, serveuse_id, actif, modifie_par, modifie_le FROM utilisateurs ORDER BY nom COLLATE "C" ASC');
    res.json(rows);
  } catch (e) { erreurServeur(res, e); }
});

app.post('/api/utilisateurs', exigerRole('admin'), async (req, res) => {
  const { nom_utilisateur, mot_de_passe, role, nom, prenom, serveuse_id } = req.body;
  if (!nom_utilisateur || !mot_de_passe || !role || !nom || !prenom) {
    return res.status(400).json({ erreur: 'Tous les champs sont requis.' });
  }
  if (!['admin', 'gerant', 'serveuse'].includes(role)) return res.status(400).json({ erreur: 'Rôle invalide.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO utilisateurs (nom_utilisateur, mot_de_passe, role, nom, prenom, serveuse_id, modifie_par, modifie_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       RETURNING id, nom_utilisateur, role, nom, prenom, serveuse_id, actif`,
      [nom_utilisateur, hacherMotDePasse(mot_de_passe), role, nom, prenom, serveuse_id || null, req.utilisateur.prenom]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ erreur: 'Cet identifiant est déjà utilisé.' });
    erreurServeur(res, e);
  }
});

app.patch('/api/utilisateurs/:id', exigerRole('admin'), async (req, res) => {
  const { actif, role, mot_de_passe, serveuse_id } = req.body;
  try {
    const champs = [];
    const valeurs = [];
    let i = 1;
    if (actif !== undefined) { champs.push(`actif = $${i++}`); valeurs.push(actif); }
    if (role) { champs.push(`role = $${i++}`); valeurs.push(role); }
    if (serveuse_id !== undefined) { champs.push(`serveuse_id = $${i++}`); valeurs.push(serveuse_id || null); }
    if (mot_de_passe) { champs.push(`mot_de_passe = $${i++}`); valeurs.push(hacherMotDePasse(mot_de_passe)); }
    champs.push(`modifie_par = $${i++}`); valeurs.push(req.utilisateur.prenom);
    champs.push(`modifie_le = now()`);
    valeurs.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE utilisateurs SET ${champs.join(', ')} WHERE id = $${i} RETURNING id, nom_utilisateur, role, nom, prenom, serveuse_id, actif`,
      valeurs
    );
    if (rows.length === 0) return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    res.json(rows[0]);
  } catch (e) { erreurServeur(res, e); }
});

app.delete('/api/utilisateurs/:id', exigerRole('admin'), async (req, res) => {
  try {
    const { rows: admins } = await pool.query("SELECT COUNT(*)::int AS n FROM utilisateurs WHERE role='admin' AND actif=true");
    const { rows: cible } = await pool.query('SELECT * FROM utilisateurs WHERE id = $1', [req.params.id]);
    if (cible.length && cible[0].role === 'admin' && admins[0].n <= 1) {
      return res.status(400).json({ erreur: 'Impossible de supprimer le dernier compte administrateur.' });
    }
    await pool.query('DELETE FROM utilisateurs WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e); }
});

// ===================== BOISSONS =====================

app.get('/api/boissons', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM boissons ORDER BY categorie, nom COLLATE "C" ASC');
    res.json(rows);
  } catch (e) { erreurServeur(res, e); }
});

app.post('/api/boissons', exigerRole('admin', 'gerant'), async (req, res) => {
  const {
    categorie, nom, taille, unites_par_carton, prix_achat_carton,
    prix_achat_unite, prix_vente_bouteille, prix_vente_verre_petit,
    prix_vente_verre_grand, stock_bouteilles, seuil
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
       prix_vente_verre_grand || null, stock_bouteilles || 0, seuil ?? 6, req.utilisateur.prenom]
    );
    res.json(rows[0]);
  } catch (e) { erreurServeur(res, e); }
});

app.patch('/api/boissons/:id', exigerRole('admin', 'gerant'), async (req, res) => {
  const { stock_bouteilles } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE boissons SET stock_bouteilles = $1, modifie_par = $2, modifie_le = now()
       WHERE id = $3 RETURNING *`,
      [Math.max(0, stock_bouteilles), req.utilisateur.prenom, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ erreur: 'Boisson introuvable.' });
    res.json(rows[0]);
  } catch (e) { erreurServeur(res, e); }
});

app.delete('/api/boissons/:id', exigerRole('admin', 'gerant'), async (req, res) => {
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

app.post('/api/serveuses', exigerRole('admin', 'gerant'), async (req, res) => {
  const { nom, prenom } = req.body;
  if (!nom || !prenom) return res.status(400).json({ erreur: 'Nom et prénom requis.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO serveuses (nom, prenom, modifie_par, modifie_le) VALUES ($1,$2,$3, now()) RETURNING *`,
      [nom, prenom, req.utilisateur.prenom]
    );
    res.json(rows[0]);
  } catch (e) { erreurServeur(res, e); }
});

app.delete('/api/serveuses/:id', exigerRole('admin', 'gerant'), async (req, res) => {
  try {
    await pool.query('DELETE FROM serveuses WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e); }
});

// ===================== COMMANDES =====================

app.get('/api/commandes', async (req, res) => {
  try {
    let sql = 'SELECT * FROM commandes';
    const params = [];

    if (req.utilisateur.role === 'serveuse') {
      params.push(req.utilisateur.serveuse_id);
      sql += ' WHERE serveuse_id = $1';
    } else {
      const { serveuse_id, nom, prenom } = req.query;
      const conditions = [];
      if (serveuse_id) { params.push(serveuse_id); conditions.push(`serveuse_id = $${params.length}`); }
      if (nom) { params.push(nom); conditions.push(`serveuse_nom = $${params.length}`); }
      if (prenom) { params.push(prenom); conditions.push(`serveuse_prenom = $${params.length}`); }
      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY cree_le DESC';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { erreurServeur(res, e); }
});

app.post('/api/commandes', async (req, res) => {
  let { serveuse_id, boisson_id, type_vente, quantite } = req.body;

  if (req.utilisateur.role === 'serveuse') {
    if (!req.utilisateur.serveuse_id) return res.status(403).json({ erreur: 'Ce compte n\'est rattaché à aucune serveuse.' });
    serveuse_id = req.utilisateur.serveuse_id;
  }

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
      [serveuse_id, s.nom, s.prenom, boisson_id, b.nom, type_vente, quantite, prixUnitaire, total, req.utilisateur.prenom]
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

app.delete('/api/commandes/:id', exigerRole('admin', 'gerant'), async (req, res) => {
  try {
    await pool.query('DELETE FROM commandes WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e); }
});

// ===================== RETOURS =====================
// Un retour est enregistré comme une commande, mais en négatif dans les totaux.
// Le stock est remis en cave si c'était une vente à la bouteille.

app.get('/api/retours', async (req, res) => {
  try {
    let sql = 'SELECT * FROM retours';
    const params = [];

    if (req.utilisateur.role === 'serveuse') {
      params.push(req.utilisateur.serveuse_id);
      sql += ' WHERE serveuse_id = $1';
    } else {
      const { serveuse_id, nom, prenom } = req.query;
      const conditions = [];
      if (serveuse_id) { params.push(serveuse_id); conditions.push(`serveuse_id = $${params.length}`); }
      if (nom) { params.push(nom); conditions.push(`serveuse_nom = $${params.length}`); }
      if (prenom) { params.push(prenom); conditions.push(`serveuse_prenom = $${params.length}`); }
      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY cree_le DESC';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { erreurServeur(res, e); }
});

app.post('/api/retours', async (req, res) => {
  let { serveuse_id, boisson_id, type_vente, quantite } = req.body;

  if (req.utilisateur.role === 'serveuse') {
    if (!req.utilisateur.serveuse_id) return res.status(403).json({ erreur: 'Ce compte n\'est rattaché à aucune serveuse.' });
    serveuse_id = req.utilisateur.serveuse_id;
  }

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
      `INSERT INTO retours (serveuse_id, serveuse_nom, serveuse_prenom, boisson_id, boisson_nom, type_vente, quantite, prix_unitaire, total, modifie_par, cree_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now()) RETURNING *`,
      [serveuse_id, s.nom, s.prenom, boisson_id, b.nom, type_vente, quantite, prixUnitaire, total, req.utilisateur.prenom]
    );

    if (type_vente === 'bouteille') {
      await pool.query('UPDATE boissons SET stock_bouteilles = stock_bouteilles + $1 WHERE id = $2', [quantite, boisson_id]);
    }

    res.json(rows[0]);
  } catch (e) { erreurServeur(res, e); }
});

app.delete('/api/retours/:id', exigerRole('admin', 'gerant'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM retours WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erreur: 'Retour introuvable.' });
    const r = rows[0];
    // On annule l'effet du retour : on retire à nouveau du stock ce qui avait été remis
    if (r.type_vente === 'bouteille' && r.boisson_id) {
      await pool.query('UPDATE boissons SET stock_bouteilles = GREATEST(0, stock_bouteilles - $1) WHERE id = $2', [r.quantite, r.boisson_id]);
    }
    await pool.query('DELETE FROM retours WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e); }
});

// ===================== BILANS (admin / gérant uniquement) =====================

app.get('/api/bilans-resume', exigerRole('admin', 'gerant'), async (req, res) => {
  try {
    const { rows: commandesRes } = await pool.query(`
      SELECT serveuse_id, serveuse_nom, serveuse_prenom,
             COUNT(*) AS nombre_commandes, SUM(total) AS total
      FROM commandes
      GROUP BY serveuse_id, serveuse_nom, serveuse_prenom
      ORDER BY serveuse_nom COLLATE "C" ASC
    `);
    const { rows: retoursRes } = await pool.query(`
      SELECT serveuse_id, serveuse_nom, serveuse_prenom,
             COUNT(*) AS nombre_retours, SUM(total) AS total_retours
      FROM retours
      GROUP BY serveuse_id, serveuse_nom, serveuse_prenom
    `);
    res.json({ commandes: commandesRes, retours: retoursRes });
  } catch (e) { erreurServeur(res, e); }
});

// ===================== DEPENSES (admin / gérant uniquement) =====================

app.get('/api/depenses', exigerRole('admin', 'gerant'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM depenses ORDER BY date_depense DESC, cree_le DESC');
    res.json(rows);
  } catch (e) { erreurServeur(res, e); }
});

app.post('/api/depenses', exigerRole('admin', 'gerant'), async (req, res) => {
  const { categorie, libelle, montant, date_depense } = req.body;
  if (!categorie || montant === undefined) return res.status(400).json({ erreur: 'Catégorie et montant requis.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO depenses (categorie, libelle, montant, date_depense, modifie_par, cree_le)
       VALUES ($1,$2,$3,$4,$5, now()) RETURNING *`,
      [categorie, libelle || null, montant, date_depense || new Date().toISOString().slice(0,10), req.utilisateur.prenom]
    );
    res.json(rows[0]);
  } catch (e) { erreurServeur(res, e); }
});

app.delete('/api/depenses/:id', exigerRole('admin', 'gerant'), async (req, res) => {
  try {
    await pool.query('DELETE FROM depenses WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { erreurServeur(res, e); }
});

app.use(express.static(path.join(__dirname, 'public')));

initialiserBaseDeDonnees()
  .then(() => app.listen(PORT, () => console.log(`JPA Bar — serveur lancé sur le port ${PORT}`)))
  .catch((e) => { console.error('❌ Erreur d\'initialisation :', e); process.exit(1); });
