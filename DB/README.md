# Base de données (Supabase)

Ce dossier contient toutes les requêtes SQL de l'application. Elles se lancent dans
Supabase : **SQL Editor → New query → coller le contenu du fichier → Run**.

## Installation

Le plus simple : exécuter **`00_installation_complete.sql`**, qui réunit les trois fichiers ci-dessous.
Il est à relancer après chaque mise à jour de l'application (rien n'est effacé).

Ou, fichier par fichier, dans cet ordre :

| Ordre | Fichier | Rôle |
|---|---|---|
| 1 | `01_tables.sql` | Crée les tables : commandes (`deco_articles`, `deco_orders`, `deco_gestion_meta`), Lenbox (`deco_lenbox_files`, `deco_lenbox_transactions`, `deco_lenbox_meta`), paramètres et jeu de test (`deco_settings`). Toutes préfixées `deco_` pour ne toucher à aucune autre table du projet |
| 2 | `02_fonctions.sql` | Crée les fonctions utilisées par l'application pour lire et écrire |
| 3 | `03_securite.sql` | Verrouille l'accès : seule la clé secrète du serveur peut lire et écrire |

Les trois fichiers peuvent être relancés sans risque : ils n'effacent aucune donnée.

`04_requetes_utiles.sql` n'est pas à installer : ce sont des requêtes de consultation
(état du stock, livraisons à venir, commandes à programmer…) à lancer quand vous en avez besoin.

## Clés à fournir à l'application

Dans Supabase : **Project Settings → API Keys**. Deux valeurs sont nécessaires :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | l'adresse du projet, `https://VOTRE-PROJET.supabase.co` |
| `SUPABASE_SECRET_KEY` | la clé **secrète** (`sb_secret_…`), à ne jamais partager ni publier |

- **En local** : dans le fichier `.env.local` à la racine du projet.
- **Sur Vercel** : Project → Settings → Environment Variables, puis redéployer.

La clé publique (`sb_publishable_…`) n'est pas utilisée : avec elle, n'importe qui pourrait
lire les données clients. Le fichier `03_securite.sql` lui interdit tout accès.

## Autres fichiers

- `04_requetes_utiles.sql` : requêtes de consultation, à lancer à la demande.
- `06_inventaire.sql` : ajoute la catégorie, les dimensions et le coloris aux articles, met à jour la fonction d'enregistrement et importe le stock (113 produits, une pièce chacun). À lancer une fois sur une base déjà installée ; inutile pour une installation neuve suivie d'un import par la page Inventaire.
- `05_nettoyage_premiere_version.sql` : facultatif, supprime les trois tables sans préfixe créées par la toute première installation (seulement si elles sont vides). À ne lancer que dans un projet dédié à cette application.

## Faire évoluer la base

Pour toute modification future, ajoutez un nouveau fichier numéroté (`06_…sql`, `07_…sql`) plutôt que de modifier les anciens,
puis régénérez `00_installation_complete.sql` : le dossier garde ainsi l'historique de la base.
