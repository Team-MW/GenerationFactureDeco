# DECOSHOP · Gestion

Application web de gestion pour DECOSHOP : commandes, stock, livraisons, tournées du livreur, et factures générées à partir des exports Lenbox.

## Les espaces

| Espace | Adresse | Rôle |
|---|---|---|
| Accueil | `/` | Choix de l'espace, bouton « Mode test », lien vers les paramètres |
| Gestion commandes | `/commandes` | Bons de commande, stock, planning des livraisons à la semaine, tableau des ventes |
| Magasinier | `/magasinier` | Commandes à préparer par jour, historique des préparations |
| Livreur | `/livreur` | Tournée du jour, trajet le plus rapide, bouton Waze par arrêt, encaissements |
| Gestion Lenbox | `/lenbox` | Factures créées depuis les exports Lenbox (CSV / Excel), statistiques |
| Paramètres | `/parametres` | Société, adresse de départ des livraisons, factures, logo, e-mails |

## Lancer en local

```bash
npm install     # une seule fois
npm run dev     # puis ouvrir l'adresse affichée (http://localhost:3000 par défaut)
```

`npm run dev` prépare chaque page à la demande : la première ouverture est lente. Pour la vitesse réelle : `npm run build` puis `npm start`.

## Configuration

Tout se règle par variables d'environnement : fichier `.env.local` en local (modèle dans `.env.example`), et Settings → Environment Variables sur Vercel.

| Variable | Rôle |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Base de données. Sans elles, l'application enregistre dans des fichiers du dossier `data/` (usage local uniquement). |
| `APP_PASSWORD` | Code d'accès demandé à l'ouverture. **Obligatoire en ligne** : sans lui, le site est ouvert à tous. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | Envoi des e-mails par SMTP |
| `MAIL_FROM`, `MAIL_REPLY_TO`, `MAIL_BCC` | Expéditeur affiché, adresse de réponse, copie cachée |

La base se prépare avec les fichiers du dossier [`DB/`](DB/README.md).

## Fonctionnement

### Commandes

- Un **bon de commande** se crée depuis « Nouveau bon » : client, articles (choisis dans le stock ou créés sur place), réduction, formule de livraison (retrait gratuit, pied de porte 50 €, étage 100 €, montage 150 €), acompte, date et heure de livraison.
- Le **stock** est réservé à la validation. Un article manquant met la commande « en attente » ; une entrée de stock sert d'abord les commandes en attente, de la plus ancienne à la plus récente.
- Le bon (recto commande, verso conditions générales) est généré en PDF. Les numéros (`BL-AAAA-0001`) ne sont jamais réutilisés.
- Le texte des conditions générales se modifie dans `lib/orders/cgv.ts`.

### Livraisons

- Le **planning à la semaine** place chaque livraison à son heure ; un clic sur un créneau vide y programme une commande.
- Le **livreur** voit ses arrêts du jour, peut calculer le trajet le plus rapide depuis le dépôt (ou depuis une adresse saisie à la main), ouvre Waze en un geste, encaisse (espèces, carte, virement) et ajoute une prestation faite sur place.
- Cartes et itinéraires : OpenStreetMap (Nominatim pour placer les adresses, OSRM pour les temps de route). Seules les adresses et coordonnées sont transmises.

### E-mails

Quatre messages au client, envoyés depuis la fiche commande : bon de commande (PDF joint), date de livraison, rappel, livraison effectuée. Un aperçu est disponible même sans SMTP configuré.

### Lenbox

- Les exports (`.csv`, `.xlsx`, `.xls`) se déposent dans « Import ». Chaque ligne de vente donne une facture ; les lignes sans vente (retenues) sont comptées dans les statistiques.
- Colonnes attendues : `transferred_on`, `demandereq_ref`, `client`, `original_amount`, `transferred_amount`, `commission_retained`, `additional_amount_retained`.
- Un numéro de facture attribué ne change jamais, même si un fichier est retiré puis réimporté.

### Mode test

Le bouton « Mode test » de l'accueil bascule l'appareil sur un jeu de commandes fictives, séparé des vraies (numéros `TEST-…`). Il ne concerne que les commandes, le stock et le planning : **les factures Lenbox et les paramètres restent réels**.

## Données et confidentialité

- `.env.local` n'est jamais suivi par git.
- Le dossier `factures/`, `data/lenbox.json` et les exports Lenbox contiennent des noms de clients : le dépôt doit rester **privé**.
- En local sans base, les données vivent dans `data/` (`gestion.json`, `lenbox.json`, `parametres.json`). `data/.registre.json` est l'ancien registre des numéros, repris une seule fois à la première importation.
