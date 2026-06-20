# JPA Bar v2 — Boissons par catégorie, ventes & bilans serveuses

## Ce qui a changé par rapport à la version précédente
- ❌ Plus de partie "Ingrédients"
- ✅ Boissons classées en 4 catégories : **Sobebras**, **Vins**, **Whiskys**, **Autres**
- ✅ Prix d'achat adaptés par catégorie :
  - Sobebras : par casier (24 bouteilles si "petite", 12 si "grande")
  - Vins : par carton de 6
  - Whiskys : à la bouteille
  - Autres : à l'unité
- ✅ Prix de vente :
  - Sobebras, Vins, Autres : à la bouteille / unité
  - Whiskys : au verre (petit et grand) **ou** à la bouteille
- ✅ Gestion des **serveuses** (nom, prénom)
- ✅ **Commandes** : chaque serveuse peut enregistrer ce qu'elle a vendu (boisson, type de vente, quantité) — le prix est calculé automatiquement
- ✅ **Bilans individuels** par serveuse, avec impression (bouton 🖨)
- ✅ Tout reste tracé : qui a fait quoi et quand

Le stock (en bouteilles) est automatiquement déduit quand une vente est faite **à la bouteille**. Les ventes au verre ne déduisent pas le stock bouteille par bouteille (une bouteille ouverte servie au verre n'est pas suivie au mL ici) — elles comptent uniquement dans le chiffre de ventes et les bilans.

## Déploiement sur Render (identique à la dernière fois)

### 1. Dépôt GitHub
Cette fois, place bien **tout le contenu de ce dossier directement à la racine** du dépôt (pas dans un sous-dossier) :
```
ton-depot/
├── server.js
├── package.json
└── public/
    └── index.html
```

### 2. Base de données PostgreSQL
Si tu as déjà une base PostgreSQL créée sur Render pour la version précédente, tu peux la réutiliser — les nouvelles tables (`boissons`, `serveuses`, `commandes`) se créeront automatiquement au démarrage. ⚠️ Note : la table `boissons` a changé de structure, donc si tu gardes la même base, je recommande de la vider pour repartir propre :
   - Va sur ta base PostgreSQL sur Render → onglet **Connect** → connecte-toi avec `psql` ou un outil comme **pgAdmin**, et exécute :
     ```sql
     DROP TABLE IF EXISTS commandes;
     DROP TABLE IF EXISTS boissons;
     ```
   - Au prochain démarrage du serveur, les nouvelles tables seront recréées proprement (la table `serveuses` n'a pas besoin d'être touchée si elle existe déjà, mais elle n'existait pas avant donc rien à faire).

Si tu préfères, tu peux aussi simplement créer une toute nouvelle base PostgreSQL sur Render et mettre à jour la variable `DATABASE_URL` du service avec sa nouvelle "Internal Database URL".

### 3. Service web
- **Build Command** : `npm install`
- **Start Command** : `npm start`
- Variable d'environnement : `DATABASE_URL` (l'URL interne de ta base PostgreSQL Render)

### 4. C'est en ligne
Mêmes étapes que la dernière fois — Render redéploie automatiquement à chaque push sur GitHub.

## Comment ça marche pour tes employés
1. Onglet **Boissons** : ajoute les boissons par catégorie, gère le stock (+1 bouteille, +1 casier/carton, ou retire).
2. Onglet **Serveuses** : ajoute chaque serveuse une fois.
3. Onglet **Commandes** : chaque vente est enregistrée ici — choisis la serveuse, la boisson, le type de vente (bouteille ou verre pour les whiskys), la quantité. Le prix se calcule automatiquement.
4. Onglet **Bilans** : clique sur une serveuse pour voir le détail de ses ventes et le total, puis imprime si besoin.

✅ Testé en conditions réelles avant livraison (ajout de boissons des 4 catégories, vente à la bouteille avec déduction de stock, vente au verre sans déduction, calcul du bilan).
