# GenerationFactureDeco

Application Next.js de génération automatique de factures à partir de fichiers CSV / Excel, avec tableau de bord.

## Lancer l'application

```bash
npm install     # une seule fois
npm run dev     # puis ouvrir http://localhost:3000
```

## Fonctionnement

- Déposez vos fichiers (`.csv`, `.xlsx`, `.xls`) dans la fenêtre de l'application ou directement dans le dossier `data/`.
- Chaque ligne de vente (colonne `original_amount` > 0) donne une facture ; les PDF sont écrits dans `factures/<mois>/`.
- Les lignes sans vente (retenues) ne sont pas facturées ; elles apparaissent dans les statistiques.
- Les numéros de facture sont enregistrés dans `data/.registre.json` et ne changent jamais : ne supprimez pas ce fichier.
- Les informations de votre société, la TVA et le logo se règlent dans l'écran « Paramètres » (`data/parametres.json`).

Colonnes attendues : `transferred_on`, `demandereq_ref`, `client`, `original_amount`, `transferred_amount`, `commission_retained`, `additional_amount_retained`.
