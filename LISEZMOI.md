# JPA Bar v3 — Dépenses, Solde & historique protégé

## Nouveautés par rapport à la v2
- **Commandes** : totaux automatiques "du jour" et "du mois", + barre de recherche par jour/mois/année
- **Dépenses** (nouvel onglet) : catégories Salaire / Achat / Facture courant / Eau / Autre (texte libre possible), avec date, total affiché selon le filtre, séparation par mois via la recherche par date
- **Solde** (nouvel onglet) : Total ventes − Total dépenses sur la période choisie (par défaut le mois en cours), avec indication Bénéfice (vert) ou Perte (rouge)
- **Historique protégé** : si tu retires une serveuse, ses commandes passées restent intactes et continuent d'apparaître dans Commandes et Bilans (avec la mention "supprimée")
- **Bilans** : impression désormais **par commande** (bouton 🖨 sur chaque ligne) plutôt qu'un seul bouton global — le détail complet des commandes reste toujours visible à l'écran
- **Dates** : partout, affichage complet jour/mois/**année** + heure

## ⚠️ Important si tu avais déjà déployé une version précédente
La structure de la table `commandes` change légèrement (ajout du nom/prénom de la serveuse au moment de la vente, pour ne plus jamais perdre l'historique). **Le serveur fait la mise à jour automatiquement au démarrage** — tu n'as rien à supprimer manuellement cette fois, contrairement aux fois précédentes. Tes anciennes commandes seront conservées et complétées automatiquement avec le nom de la serveuse correspondante.

✅ Testé en conditions réelles avant livraison :
- Ajout boisson, serveuse, commande
- Suppression d'une serveuse → sa commande passée reste visible partout
- Le bilan résumé continue d'inclure les serveuses supprimées (avec badge "supprimée")
- Ajout d'une dépense daté

## Déploiement sur Render
Mêmes étapes que pour la v2 :
1. Mets tout le contenu de ce dossier (`server.js`, `package.json`, `public/`) **à la racine** de ton dépôt GitHub
2. Garde la même base PostgreSQL et le même service web sur Render (pas besoin de tout recréer)
3. Pousse le nouveau code → Render redéploie automatiquement
4. Au démarrage, regarde les logs : tu dois voir `✅ Tables prêtes (boissons, serveuses, commandes, depenses).`

## Comment utiliser les nouveaux onglets
- **Dépenses** : ajoute chaque sortie d'argent (salaire versé, achat de marchandise, facture d'eau/électricité, etc.) avec sa date. Utilise la barre de recherche (jour/mois/année) pour ne voir que les dépenses d'un mois précis — le total affiché juste au-dessus s'ajuste automatiquement.
- **Solde** : choisis une période (par défaut le mois en cours) pour voir d'un coup d'œil le total des ventes, le total des dépenses, et le solde — vert si bénéfice, rouge si perte.
- **Bilans** : clique sur une serveuse (active ou supprimée), filtre par date si besoin, et imprime chaque commande individuellement avec le bouton 🖨 sur sa ligne.
