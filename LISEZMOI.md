# JPA Bar — Registre de stock (Render + PostgreSQL)

## Ce que c'est
Ton propre serveur (Node.js) + ta propre base de données (PostgreSQL), tous les deux hébergés gratuitement sur Render. Aucun service tiers (Supabase, Firebase…) — tout t'appartient.

- Au démarrage : **aucune boisson ni ingrédient enregistré**, c'est toi/tes employés qui remplissez tout.
- Chaque ajout/modification/suppression est sauvegardé directement en base.
- Chaque ligne affiche qui a fait la dernière modification et quand.
- La page se rafraîchit automatiquement toutes les 15 secondes pour montrer les changements faits par les autres employés.
- ✅ Testé et fonctionnel (ajout, modification +/−, suppression — tout marche).

## Structure du projet
```
jpa-bar-postgres/
├── server.js          → le serveur (API + sert l'interface) + crée les tables automatiquement
├── package.json        → dépendances (express, pg)
└── public/
    └── index.html      → l'interface (HTML + CSS + JS)
```

## Déploiement sur Render — étape par étape

### 1. Mets le code sur GitHub
- Crée un dépôt GitHub (ex. `jpa-bar-stock`).
- Mets-y tout le contenu de ce dossier (pas besoin du dossier `node_modules` s'il existe).

### 2. Crée la base de données PostgreSQL sur Render
1. Va sur https://render.com, connecte-toi (ou crée un compte, gratuit).
2. Clique sur **New +** → **PostgreSQL**.
3. Donne-lui un nom (ex. `jpa-bar-db`), choisis le plan **Free**.
4. Clique sur **Create Database**.
5. Attends qu'elle soit prête (statut "Available"), puis va dans sa page et copie la valeur **Internal Database URL** (tu en auras besoin à l'étape suivante).

### 3. Crée le service web
1. Clique sur **New +** → **Web Service**.
2. Connecte ton dépôt GitHub `jpa-bar-stock`.
3. Renseigne :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - Plan : **Free**
4. Dans la section **Environment Variables**, ajoute :
   - Clé : `DATABASE_URL`
   - Valeur : colle l'**Internal Database URL** copiée à l'étape 2
5. Clique sur **Create Web Service**.

Render va construire et démarrer le serveur. Au premier démarrage, il crée automatiquement les deux tables (`boissons` et `ingredients`) dans la base — tu n'as rien d'autre à faire.

### 4. C'est en ligne
Render te donne une URL du type `https://jpa-bar-stock.onrender.com`. C'est cette adresse que tu partages à tes employés.

## ⚠️ Point à connaître avec le plan gratuit
Le service web gratuit s'endort après 15 minutes sans visite, et se réveille en quelques secondes dès qu'on rouvre la page (léger délai au premier chargement, sans incidence ensuite). **La base de données, elle, ne perd jamais ses données** — c'est la vraie différence avec la version testée précédemment (fichier JSON), qui pouvait être réinitialisée par Render. Avec PostgreSQL, ton stock est permanent.

Si un jour le délai de réveil devient gênant (usage très fréquent, plusieurs fois par heure), Render propose un plan payant à partir de quelques dollars/mois qui élimine cette mise en veille.

## Tester en local avant de déployer
Si tu as Node.js et PostgreSQL installés sur ton ordinateur :
```
cd jpa-bar-postgres
npm install
export DATABASE_URL="postgresql://utilisateur:motdepasse@localhost:5432/nom_de_la_base"
npm start
```
Puis ouvre `http://localhost:3000`.
