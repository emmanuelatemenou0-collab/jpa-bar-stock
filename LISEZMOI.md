# JPA Bar v5 — Connexion sécurisée, rôles & révocation d'accès

## Ce qui répond à ta question de confidentialité
Avant, n'importe qui avec le lien avait accès à tout, pour toujours. Maintenant :
- Chaque personne a **son propre compte** (identifiant + mot de passe)
- Tu peux **désactiver ou supprimer un compte à tout moment** depuis l'onglet "Comptes"
- ✅ **Testé en conditions réelles** : dès qu'un compte est désactivé, l'accès est coupé **immédiatement** — même si la personne avait déjà une session ouverte sur son téléphone. Elle ne peut plus rien voir ni modifier, dès la prochaine action qu'elle tente.

C'est la réponse concrète à ton problème : si un gérant part, tu désactives son compte en deux clics, et son accès à vos finances s'arrête net.

## Les 3 rôles
- **Admin** (toi) : accès à tout, y compris la création/suppression des comptes
- **Gérant** : accès à tout (boissons, commandes, serveuses, dépenses, solde, bilans) **sauf** la gestion des comptes
- **Serveuse** : accès uniquement à ses propres commandes (elle ne voit ni les dépenses, ni le solde, ni les bilans, ni les commandes des autres)

## Nouveauté visuelle
Une page de connexion stylée s'affiche maintenant avant d'accéder au site : logo "JPA BAR" et arrière-plan travaillé (dégradé doré + motif diagonal, dans le même esprit que le reste de l'app), avec un formulaire identifiant + mot de passe.

## Premier démarrage — IMPORTANT
Au tout premier lancement du serveur (quand la table des comptes est vide), un compte administrateur est créé automatiquement. Pour choisir tes propres identifiants dès le départ (recommandé), ajoute ces variables d'environnement sur Render **avant le premier démarrage** :
- `ADMIN_USERNAME` → ton identifiant (ex. `emmanuel`)
- `ADMIN_PASSWORD` → ton mot de passe (choisis-en un solide)

Si tu ne les définis pas, un compte `admin` / `changeme123` sera créé automatiquement — **change-le immédiatement** via l'onglet Comptes si c'est le cas (crée un nouveau compte admin avec ton vrai mot de passe, puis supprime ou désactive celui par défaut).

## Variable supplémentaire à ajouter sur Render : SESSION_SECRET
Ajoute aussi une variable d'environnement :
- `SESSION_SECRET` → n'importe quelle longue chaîne aléatoire (ex. génère-en une sur https://www.uuidgenerator.net/ et colle-la)

Sans ça, le serveur génère une clé temporaire à chaque démarrage, ce qui déconnecte tout le monde chaque fois que Render redémarre le service (ce qui arrive régulièrement avec le plan gratuit). Avec une vraie valeur fixe, les connexions restent valables dans la durée.

## Déploiement sur Render
1. Mets `server.js`, `package.json` et `public/index.html` à la racine de ton dépôt GitHub (comme d'habitude)
2. Sur Render, dans **Environment Variables**, ajoute en plus de `DATABASE_URL` :
   - `SESSION_SECRET`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
3. Redéploie

## Comment créer les comptes de ton équipe
1. Connecte-toi avec ton compte admin
2. Va dans l'onglet **Comptes** (visible seulement pour toi)
3. Pour une serveuse : crée d'abord la serveuse dans l'onglet "Serveuses" si ce n'est pas déjà fait, puis crée son compte ici en la liant via le menu déroulant "Serveuse liée"
4. Transmets-lui son identifiant et son mot de passe

## Quand quelqu'un quitte
Va dans **Comptes** → trouve la personne → clique sur **Désactiver** (ou **Supprimer** si tu veux effacer le compte définitivement). C'est instantané, testé et confirmé.

## Nouveautés de cette version
- **Retour de marchandise** : bouton ↩ Retour sur chaque commande (dans l'onglet Commandes et dans les Bilans). Tu indiques combien le client retourne, et ça défalque automatiquement :
  - le total de la commande
  - le bilan de la serveuse concernée
  - le stock (remis en cave si c'était une vente à la bouteille)
  - ✅ Testé : retour partiel (la commande reste avec la quantité restante) et retour total (la commande disparaît proprement) — les deux cas fonctionnent et se répercutent partout instantanément.
- **Page de connexion personnalisée** : ton vrai logo et la photo de ton bar en arrière-plan, avec le nom "JPA CHILL ET VIBES"

## Fichiers images à ne pas oublier
Ce zip inclut un dossier `public/images/` avec :
- `fond-connexion.jpeg` — la photo d'arrière-plan
- `logo-jpa.png` — ton logo

Assure-toi que ce dossier `images/` est bien envoyé sur GitHub avec son contenu (à l'intérieur de `public/`), sinon la page de connexion s'affichera sans image.

