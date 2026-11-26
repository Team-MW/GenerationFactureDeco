# Calculs de coûts, de marges et de prix — DECOSHOP

Ce document explique **tous les calculs** de l'espace Stock (coût de revient, transports, TVA, douane, marges,
coefficients, charges du magasin, prix plancher, prix de vente conseillé, rentabilité).

Il sert à deux choses :

1. comprendre d'où sort chaque chiffre affiché ;
2. donner le contexte nécessaire à une personne ou à une IA qui doit **modifier un calcul sans casser les autres**.

Avant toute modification, lire au minimum les sections 2 (règles), 11 (où modifier quoi) et 12 (cas de référence).

---

## 1. Où se trouve le code

| Fichier | Rôle |
|---|---|
| `lib/orders/pricing.ts` | **Le moteur.** Toutes les formules. Fonctions pures, sans base de données ni React : utilisables côté serveur et dans le navigateur. Toute règle de calcul se change ici et nulle part ailleurs. |
| `lib/orders/charges.ts` | Lecture, nettoyage et enregistrement des réglages (charges, postes de coût, transports, objectifs). |
| `lib/orders/revenue.ts` | Chiffre d'affaires mensuel moyen réel, calculé à partir des commandes. |
| `lib/orders/stock.ts` | Prépare les lignes produit : stock, réservé, en attente, et report du coût des transports sur chaque produit. |
| `lib/orders/build.ts` | Nettoyage des champs de coût saisis (`costFields`) et création d'une commande, qui **fige** le coût de revient sur chaque ligne. |
| `lib/orders/store.ts` | Stockage des produits. Les champs de coût vivent dans la « fiche » du produit (voir section 10). |
| `app/commandes/actions.ts` | Actions serveur : modification d'un coût, transports, modification groupée, application des prix. |
| `app/stock/actions.ts` | Lecture d'un fichier de charges (Excel ou CSV). |
| `components/orders/CostTable.tsx` | Onglet « Coûts & marges ». |
| `components/orders/ProductSheet.tsx` | Fiche détaillée d'un produit (décomposition complète et indicateurs). |
| `components/orders/TransportsBoard.tsx` | Onglet « Transports ». |
| `components/orders/PvcTable.tsx` | Onglet « Prix de vente (PVC) » et simulateur. |
| `components/orders/ChargesEditor.tsx` | Onglet « Charges du magasin ». |
| `components/orders/ProfitabilityCard.tsx` | Bandeau d'analyse de rentabilité et répartition des charges (partagé par Charges et PVC). |
| `components/orders/StockGrid.tsx` | Onglet « Stock » (reprend le coût de revient et la marge). |
| `app/commandes/ventes/page.tsx` | Tableau des ventes : marge brute réalisée sur les commandes. |

Les composants **n'ont pas le droit de refaire un calcul** : ils appellent le moteur et affichent le résultat.
C'est ce qui garantit que les onglets Stock, Coûts, PVC et la fiche produit montrent toujours les mêmes chiffres.

---

## 2. Règles de base (à ne jamais enfreindre)

1. **Tous les coûts sont hors taxes (HT).** Prix d'achat, transport, frais, douane, charges, salaires.
2. **Le prix de vente est saisi TTC** (`article.price`), parce que c'est le prix affiché en magasin. Le moteur le
   convertit en HT avant tout calcul de marge.
3. **TVA : 20 %**, constante `VAT_RATE` dans `pricing.ts`. Elle s'applique aux ventes et aux achats.
4. **La TVA ne s'applique jamais à la douane.** La douane vient en plus, après la TVA.
5. **Les marges se calculent en HT**, sur le coût de revient HT. La TVA payée à l'achat est récupérée par le
   magasin, elle n'est donc pas un coût. Le « coût total TTC » est affiché pour information (ce qui sort de la
   trésorerie), il n'entre dans aucune marge.
6. **0 signifie « non renseigné »** pour un prix ou un coût. Un produit sans prix d'achat n'a ni coût de revient,
   ni marge, ni prix conseillé : le moteur renvoie `0` ou `null`, jamais un chiffre inventé.
7. **Arrondi au centime à chaque étape** (`round2`). Les totaux de stock multiplient ensuite la valeur unitaire
   arrondie par le nombre de pièces.
8. **Les valeurs négatives ou illisibles valent 0** (`positive`). Aucun calcul ne produit `NaN` ou `Infinity` :
   les dénominateurs sont bornés (voir section 8).

---

## 3. Coût de revient d'un produit

Fonction : `costBreakdown(article, items)` — renvoie le détail ; `landedCost(article, items)` renvoie seulement
le coût de revient HT.

### 3.1 Les éléments

| Élément | Champ | Calcul |
|---|---|---|
| Achat | `cost` | Prix d'achat HT d'une pièce. Indispensable. |
| Transport | voir section 4 | Part du camion, ou montant saisi à la main. |
| Autres frais | `fees` | Euros par pièce (manutention, assurance…). |
| Postes de coût | voir 3.3 | Postes définis par le magasin. |
| Douane | `customsRate`, `customsFixed` | `customsRate` % × (achat + transport) + `customsFixed` € par pièce. |

### 3.2 Les formules

```
sous-total HT   = achat + transport + autres frais + postes (en € et en % de l'achat)
TVA             = 20 % × sous-total HT                      ← jamais sur la douane
douane          = customsRate % × (achat + transport) + customsFixed
coût total TTC  = sous-total HT + TVA + douane              ← information de trésorerie
coût de revient = sous-total HT + douane                    ← HT, sert à toutes les marges
```

Dans le code : `subtotal`, `vat`, `customs`, `totalTtc`, `total`.

**Exemple** — achat 500 €, transport 100 €, autres frais 20 €, douane 5 % + 15 € :

```
sous-total HT   = 500 + 100 + 20            = 620,00 €
TVA             = 20 % × 620                = 124,00 €
douane          = 5 % × (500 + 100) + 15    =  45,00 €
coût total TTC  = 620 + 124 + 45            = 789,00 €
coût de revient = 620 + 45                  = 665,00 €
```

La base de la douane en pourcentage est **achat + transport** seulement : ni les autres frais ni les postes.

### 3.3 Postes de coût personnalisés

Le magasin crée ses propres postes (`PricingSettings.costItems`). Chaque poste a un type (`CostKind`) :

| Type | Effet |
|---|---|
| `euro` | Montant par pièce, ajouté au sous-total HT. |
| `pct-achat` | Pourcentage du **prix d'achat**, ajouté au sous-total HT. |
| `pct-vente` | Pourcentage du **prix de vente HT** (commission, frais de carte). N'entre **pas** dans le coût de revient : c'est un « frais de vente », retiré de la marge (section 5) et pris en compte dans les prix (section 8). |

Valeur retenue (`itemValue`) : la valeur propre au produit si elle existe (`article.extras[idDuPoste]`), sinon la
valeur par défaut du poste. **Une valeur propre de 0 signifie « ce poste ne s'applique pas à ce produit »** — ce
n'est pas la même chose qu'une valeur absente.

Le total des postes `pct-vente` donne `salesRate` (proportion, 0,05 = 5 %), plafonné à 90 %.

---

## 4. Transport : répartition d'un camion

Deux façons de renseigner le transport d'un produit, par ordre de priorité :

1. **Transport numéroté** (`article.truckId` + `article.truckQty`) : le produit est rattaché à un camion ou
   conteneur enregistré dans `PricingSettings.transports`.
2. **Camion saisi à la main** (`truckCost` ÷ `truckUnits`).
3. À défaut, **transport par pièce saisi directement** (`transport`).

### 4.1 Règle de répartition

Le coût d'un transport est divisé **à parts égales entre tous les articles** qu'il contient, quel que soit le
produit :

```
articles du transport = somme des quantités (truckQty) de tous les produits rattachés
part par article      = coût du transport ÷ articles du transport
```

**Exemple** — camion CAM-014 à 900 €, avec 4 tables, 3 buffets et 2 canapés :

```
articles = 4 + 3 + 2 = 9
part     = 900 ÷ 9   = 100 € par article
```

Chaque table, chaque buffet et chaque canapé porte 100 € de transport. Contrôle : 9 × 100 = 900 €.

Une quantité absente ou nulle compte pour 1 (un produit rattaché contient au moins une pièce).

La part est arrondie au centime : la somme des parts peut donc s'écarter du coût du camion d'un demi-centime
par article au plus (1 000 € pour 3 articles donne 333,33 € × 3 = 999,99 €).

**Saisir un transport à la main sur un produit le sort de son transport numéroté** (`setArticleCost` et
`bulkUpdateArticles`, champ `transport`) : sans cela, la part du camion continuerait de s'appliquer et le
montant saisi resterait sans effet. Le camion se recalcule alors sur les articles qui lui restent.

### 4.2 Comment c'est branché

- `transportTotals(articles, transports)` calcule, par transport, le nombre de produits, d'articles et la part.
- `withTransports(articles, transports)` **recopie le coût et le nombre d'articles du transport dans
  `truckCost` / `truckUnits`** de chaque produit rattaché. Après cet appel, le reste du moteur ne connaît plus
  les transports : `transportPerUnit` fait simplement `truckCost ÷ truckUnits`.
- `stockRows(db, transports)` applique `withTransports`. **Toute page qui affiche un coût doit passer les
  transports à `stockRows`**, sinon la part de transport est fausse.
- Un produit rattaché à un transport supprimé retombe sur ses valeurs saisies à la main.

Attention : les lignes produit reçues par les composants ont donc des `truckCost` / `truckUnits` **déjà
remplacés** par ceux du transport. La fiche produit n'enregistre jamais ces valeurs comme une saisie manuelle
quand un transport est choisi (voir `ProductSheet.tsx`, fonction `save`).

---

## 5. Marge d'un produit

Fonction : `margin(article, vatRate, items)`. Renvoie `null` si le prix d'achat ou le prix de vente manque.

```
prix de vente HT = prix de vente TTC ÷ 1,20
TVA collectée    = prix de vente TTC − prix de vente HT
frais de vente   = prix de vente HT × salesRate            (postes en % du prix de vente)
marge brute      = prix de vente HT − coût de revient − frais de vente
```

### 5.1 Coefficients et taux

| Indicateur | Champ | Formule | Lecture |
|---|---|---|---|
| Coefficient TTC | `coefficient` | prix de vente TTC ÷ coût de revient | Le multiplicateur utilisé en magasin. |
| Coefficient HT | `coefficientHt` | prix de vente HT ÷ coût de revient | |
| Taux de marque | `rate` | marge brute ÷ prix de vente HT | Part du prix qui reste. Toujours < 100 %. |
| Taux de marge | `markup` | marge brute ÷ coût de revient | Ce que rapporte 1 € investi. Peut dépasser 100 %. |

Ne pas confondre taux de marque et taux de marge : pour un même produit, 35,5 % de marque = 55 % de marge.

**Exemple** — coût de revient 665 €, vendu 1 200 € TTC, sans frais de vente :

```
prix de vente HT = 1 200 ÷ 1,20 = 1 000,00 €
marge brute      = 1 000 − 665  =   335,00 €
taux de marque   = 335 ÷ 1 000  = 33,5 %
taux de marge    = 335 ÷ 665    = 50,4 %
coefficient TTC  = 1 200 ÷ 665  = 1,80
coefficient HT   = 1 000 ÷ 665  = 1,50
```

Vérification que le calcul HT est le bon : en TTC, 1 200 − 789 (coût total TTC) = 411 €, dont il faut reverser
la TVA nette (200 collectés − 124 récupérés = 76 €) : 411 − 76 = **335 €**. Les deux chemins donnent le même
résultat.

---

## 6. Charges du magasin

Réglages : `PricingSettings` (clé `gestion_charges`, voir section 10).

### 6.1 Charges fixes

Chaque charge (`Charge`) a un montant, une périodicité et une famille.

```
montant mensuel = montant × (1 pour « mois », 1/3 pour « trimestre », 1/12 pour « an »)
```

Pour la famille **salaire** uniquement, les cotisations patronales s'ajoutent :

```
coût mensuel d'un salaire = montant mensuel × (1 + employerRate %)
```

`employerRate` vaut 0 par défaut : les salaires saisis sont alors considérés comme déjà complets. Si les
salaires sont saisis en brut, il faut renseigner ce taux, sinon les charges sont sous-estimées.

Fonctions : `monthlyAmount`, `monthlyCharges`, `chargesByCategory`.

### 6.2 Taux de charges

Fonction : `chargeRate(settings, averageRevenueTtc)`.

```
taux de charges = charges fixes mensuelles ÷ chiffre d'affaires HT mensuel de référence
```

Chiffre d'affaires de référence, par ordre de priorité :

1. `monthlyRevenue` saisi, pris tel quel si `revenueBasis = "ht"`, ou divisé par 1,20 si `"ttc"` ;
2. sinon, la moyenne des ventes réelles (`averageMonthlyRevenue`, toujours TTC, convertie en HT) : moyenne des
   six derniers mois **complets** ayant des ventes, commandes annulées exclues. Le mois en cours, incomplet,
   n'est compté que s'il est le seul.

Cas particuliers :

- aucune charge → taux 0 ;
- des charges mais aucun chiffre d'affaires de référence → `known = false`, taux 0. Les écrans affichent alors un
  avertissement : les prix sont calculés sans les charges ;
- taux plafonné à **90 %**.

**Lecture** : avec 57 800 € de charges et 125 000 € HT de ventes, le taux est 46,24 %. Sur 100 € vendus hors
taxes, 46,24 € paient les charges.

Ce choix de répartition (au prorata du prix de vente) est la méthode du « coût complet » : un produit cher porte
plus de charges qu'un produit bon marché. Les charges ne sont pas réparties par pièce vendue.

---

## 7. Analyse de rentabilité du magasin

Fonction : `profitability(charges, grossMarginPercent)`. Affichée par `ProfitabilityCard`.

`grossMarginPercent` est `settings.grossMarginTarget` : la marge brute **visée** par le magasin (une hypothèse
saisie, 38 % par défaut), pas la marge réelle du catalogue.

```
marge brute du mois   = CA HT de référence × marge brute visée
résultat mensuel      = marge brute du mois − charges fixes
seuil de rentabilité  = charges fixes ÷ marge brute visée            (en CA HT mensuel)
marge brute nécessaire = charges fixes ÷ CA HT de référence          (= taux de charges)
marge de sécurité     = CA HT de référence − seuil de rentabilité
coefficient minimum   = 1,20 ÷ (1 − taux de charges)                 (prix TTC ÷ coût de revient, sans bénéfice)
```

**Exemple** — 57 800 € de charges, 125 000 € HT de ventes, 38 % de marge brute :

```
marge brute du mois    = 125 000 × 0,38        =  47 500 €
résultat mensuel       = 47 500 − 57 800       = −10 300 €   → le magasin perd de l'argent
seuil de rentabilité   = 57 800 ÷ 0,38         = 152 105,26 € HT par mois
marge brute nécessaire = 57 800 ÷ 125 000      = 46,24 %
coefficient minimum    = 1,20 ÷ (1 − 0,4624)   = 2,23
```

Erreur fréquente à ne pas reproduire : le seuil de rentabilité **n'est pas égal aux charges**, et le résultat
n'est pas « ventes − charges ». Les marchandises vendues ont un coût ; seules leurs marges paient les charges.

Le coefficient minimum ne tient pas compte des frais de vente (postes `pct-vente`), qui varient d'un produit à
l'autre ; le prix plancher par produit (section 8), lui, en tient compte.

---

## 8. Prix plancher et prix de vente conseillé (PVC)

Fonction : `recommend(article, charges, settings)`. Renvoie `null` sans prix d'achat.

Principe : un prix de vente HT doit payer le coût de revient, les frais de vente, la part de charges, et laisser
le bénéfice visé. Ces trois derniers sont des **proportions du prix lui-même**, d'où la division :

```
prix plancher HT   = coût de revient ÷ (1 − taux de charges − frais de vente)
prix conseillé HT  = coût de revient ÷ (1 − taux de charges − frais de vente − bénéfice net visé)

prix plancher TTC  = prix plancher HT × 1,20
prix conseillé TTC = prix conseillé HT × 1,20, arrondi au multiple supérieur de `rounding`
```

- **Prix plancher** : la vente paie le produit et sa part de charges, sans rien gagner.
- **Prix conseillé** : il reste exactement `targetMargin` % du prix HT en bénéfice net (avant arrondi).

Garde-fou : le dénominateur ne descend jamais sous **0,05**, pour qu'un réglage extrême (charges à 90 % et
bénéfice visé à 80 %) donne un prix élevé mais fini. `targetMargin` est plafonné à 80 %.

Arrondi (`rounding`) : 0 (aucun), 1, 5, 10 ou 50 €, toujours vers le haut.

### 8.1 Situation au prix actuel

Si le produit a un prix de vente :

```
part de charges = prix de vente HT × taux de charges
frais de vente  = prix de vente HT × salesRate
bénéfice net    = prix de vente HT − coût de revient − frais de vente − part de charges
```

| Situation (`status`) | Condition |
|---|---|
| `sans-cout` | Pas de prix d'achat. |
| `sans-prix` | Coût connu, pas de prix de vente. |
| `perte` | Prix de vente HT < coût de revient. |
| `sous-plancher` | Prix TTC < prix plancher TTC. |
| `sous-conseille` | Prix TTC < prix conseillé TTC **exact (avant arrondi)**. |
| `ok` | Sinon : le bénéfice visé est atteint. |

La situation se juge sur le prix conseillé exact : un prix de 1 058 € pour un conseillé de 1 056 € arrondi à
1 060 € est bien « rentable ». L'écart affiché dans le tableau, lui, est calculé par rapport au prix arrondi.

**Exemple** — coût de revient 500 €, taux de charges 46,24 %, pas de frais de vente, bénéfice visé 15 % :

```
prix plancher HT   = 500 ÷ (1 − 0,4624)         =   930,06 €   → 1 116,07 € TTC
prix conseillé HT  = 500 ÷ (1 − 0,4624 − 0,15)  = 1 289,99 €   → 1 547,99 € TTC → 1 550 € (arrondi à 10)
```

Contrôle au prix conseillé exact : 1 289,99 − 500 − 46,24 % × 1 289,99 = 193,50 €, soit 15 % de 1 289,99 €.

### 8.2 Simulateur

Dans l'onglet PVC, le bénéfice visé et le chiffre d'affaires mensuel peuvent être modifiés **sans être
enregistrés** : le composant reconstruit un `settings` local et rappelle le moteur. Rien n'est écrit tant qu'un
prix n'est pas appliqué.

---

## 9. Ventes : marge réalisée

À la création d'un bon de commande (`insertOrder` dans `build.ts`), chaque ligne **fige** :

- `unitCost` : le coût de revient HT du produit ce jour-là (transports et postes de coût compris) ;
- `salesRate` : ses frais de vente en proportion du prix HT.

Ces valeurs ne changent plus si les coûts du produit sont modifiés ensuite. C'est voulu : la marge d'une vente
passée reflète les coûts du moment.

Calcul dans `app/commandes/ventes/page.tsx`, pour chaque ligne dont `unitCost > 0` :

```
part de remise = (sous-total − remise) ÷ sous-total             (remise de la commande répartie au prorata)
vendu TTC      = prix unitaire × quantité × part de remise
vendu HT       = vendu TTC ÷ 1,20
marge          = vendu HT × (1 − salesRate) − unitCost × quantité
```

Les commandes créées **avant** la saisie des coûts n'ont pas de `unitCost` : elles sont exclues, et l'écran
indique sur quelle part des ventes la marge est calculée. Les frais de livraison et les prestations ajoutées
n'entrent pas dans cette marge.

---

## 10. Où sont enregistrées les données

Aucune colonne ni table n'est à créer pour ces fonctions : tout est dans la table `deco_settings` (clé / valeur
JSON), déjà en place.

| Donnée | Clé `deco_settings` | Contenu |
|---|---|---|
| Fiches produit | `gestion_fiches` | Identifiant d'article → `{ category, dimensions, color, supplier, cost, transport, truckCost, truckUnits, truckId, truckQty, customsRate, customsFixed, fees, extras }` |
| Charges et réglages | `gestion_charges` | `PricingSettings` : `charges`, `transports`, `costItems`, `monthlyRevenue`, `revenueBasis`, `employerRate`, `grossMarginTarget`, `targetMargin`, `rounding` |
| Idem en mode test | `gestion_charges_test` | Copie séparée : les essais ne touchent jamais aux vraies charges. |

Le nom, la référence, le prix de vente et le stock restent dans la table `deco_articles`.

Conséquences pratiques :

- **Une modification ne touche que les champs envoyés.** `updateArticle` fusionne ce qu'il reçoit avec le produit
  existant (`{ ...article, ...input }`) avant de nettoyer. C'est indispensable : plusieurs formulaires modifient
  un produit (onglet Stock, fiche produit) et aucun ne connaît tous les champs. Sans cette fusion, enregistrer
  le formulaire de l'onglet Stock remettait à zéro la douane, les postes de coût et le transport numéroté.
  Toute nouvelle action qui écrit un produit doit suivre la même règle.

- **Ajouter un champ de coût à un produit** : l'ajouter au type `Sheet` et à `sheetOf` / `articleFromRow` dans
  `store.ts`, à `Article` et `ArticleInput` dans `types.ts`, à `costFields` dans `build.ts`, et lui donner une
  valeur par défaut dans `withArticleDefaults`. Aucune requête SQL.
- **Ajouter un réglage** : l'ajouter à `PricingSettings`, à `DEFAULT_PRICING` et à `cleanPricing` (dans
  `charges.ts`). `cleanPricing` est le seul point d'entrée : tout ce qui n'y est pas explicitement repris est
  perdu à l'enregistrement.
- `saveCharges` et `saveCostItems` réécrivent l'objet entier : chacune relit d'abord les réglages existants pour
  ne pas effacer les parties qu'elle ne gère pas (`costItems`, `transports`). Toute nouvelle action
  d'enregistrement doit faire de même.
- Les fiches sont écrites **avant** l'enregistrement des produits (`mutateRemote`) : si l'enregistrement échoue,
  il est rejoué ; dans l'ordre inverse, un produit pourrait exister sans sa fiche.

---

## 11. Où modifier quoi

| Besoin | Où intervenir |
|---|---|
| Changer le taux de TVA | `VAT_RATE` dans `pricing.ts`. Vérifier aussi `settings.vatRate` (paramètres généraux), que les pages passent au moteur. |
| Soumettre la douane à la TVA, ou changer sa base | `costBreakdown` : lignes `customs`, `subtotal`, `vat`. |
| Calculer la marge sur le coût TTC (magasin qui ne récupère pas la TVA) | `costBreakdown` : faire de `total` la valeur `totalTtc`. Tout le reste suit, car tout part de `total`. |
| Répartir un camion selon la valeur ou le volume plutôt qu'à parts égales | `transportTotals` et `withTransports`. Il faudra reporter une part **par produit** au lieu d'un couple coût / nombre d'articles commun. |
| Ajouter un type de poste de coût | `CostKind`, `KIND_LABEL`, puis les deux filtres de `costBreakdown`. |
| Répartir les charges autrement (par pièce, par famille de produits) | `chargeRate` et `recommend`. C'est la modification la plus lourde : `recommend` suppose un taux proportionnel au prix. |
| Changer la règle du prix conseillé (arrondi en « ,90 », coefficient fixe…) | `recommend` et `roundUp`. |
| Changer les seuils des situations | `recommend`, ligne `status`. |
| Ajouter une colonne dans un tableau | Le composant concerné, en lisant une valeur renvoyée par `costBreakdown`, `margin` ou `recommend`. Si la valeur n'existe pas, l'ajouter d'abord au moteur. |
| Lire un autre format de fichier de charges | `parseChargesFile` et `parseSections` dans `app/stock/actions.ts`. |

Règle d'or : **une formule se modifie dans `pricing.ts`**, jamais dans un composant. Après une modification,
recalculer à la main les cas de la section 12.

---

## 12. Cas de référence

Ces valeurs ont été vérifiées à la main. Après toute modification du moteur, elles doivent rester exactes, sauf
si la modification vise précisément à les changer.

### A. Coût de revient et TVA

Achat 500 €, transport 100 €, autres frais 20 €, douane 5 % + 15 € :

| Sous-total HT | TVA | Douane | Coût total TTC | Coût de revient HT |
|---|---|---|---|---|
| 620,00 | 124,00 | 45,00 | 789,00 | 665,00 |

Vendu 1 200 € TTC : prix HT 1 000,00 ; marge brute 335,00.

### B. Postes de coût

Achat 600 €, camion 2 400 € pour 120 articles (20 €), douane 5 % (31 €), autres frais 9 €.
Postes : emballage 5 € ; provision SAV 2 % de l'achat (12 €) ; carte bancaire 1,5 % et commission 3,5 % du prix
de vente.

| Coût de revient | Frais de vente | Vendu 1 188 € TTC (990 HT) → marge brute | Taux de marque | Taux de marge | Coef. TTC | Coef. HT |
|---|---|---|---|---|---|---|
| 677,00 | 5 % | 263,50 | 26,6 % | 38,9 % | 1,75 | 1,46 |

Avec 10 % de charges et 15 % de bénéfice visé : prix plancher 796,47 € HT ; prix conseillé 967,14 € HT, soit
1 170 € TTC arrondi ; bénéfice net au prix actuel 164,50 €.

### C. Transport

900 € pour 4 + 3 + 2 = 9 articles → 100 € par article. Quantité portée à 5 sur le dernier produit (12 articles)
→ 75 € par article.

### D. Charges (fichier « Hypothèses » de DECOSHOP)

16 charges fixes (33 800 €) + 10 salaires (24 000 €) = 57 800 € par mois ; CA de référence 125 000 € HT ; marge
brute visée 38 %.

| Taux de charges | Résultat mensuel | Seuil de rentabilité | Marge brute nécessaire | Coefficient minimum |
|---|---|---|---|---|
| 46,24 % | −10 300 € | 152 105,26 € HT | 46,24 % | 2,23 |

À 2 M€ de ventes par an (166 666,67 € par mois) : +5 533,33 € par mois.
Avec 42 % de cotisations patronales : salaires 34 080 €, charges 67 880 €.
Produit à 500 € de revient : plancher 930,06 € HT (1 116,07 € TTC) ; conseillé 1 289,99 € HT (1 550 € TTC).

### E. Situations

Coût de revient 660 €, 10 % de charges, 15 % visés : plancher 733,33 € HT (880 € TTC) ; conseillé 880 € HT
(1 056 € TTC, arrondi 1 060 €).

| Prix TTC | 700 | 850 | 1 000 | 1 055 | 1 058 | 1 188 |
|---|---|---|---|---|---|---|
| Situation | perte | sous-plancher | sous-conseille | sous-conseille | ok | ok |

Il n'existe pas de suite de tests automatisée dans le dépôt : ces cas se vérifient à la main, ou avec un petit
script qui importe `lib/orders/pricing.ts` (le fichier n'a aucune dépendance).

---

## 13. Hypothèses et limites connues

Ce sont des choix, pas des erreurs. Ils sont à connaître avant d'interpréter un chiffre ou de modifier un calcul.

1. **TVA d'achat récupérable.** Les marges ignorent la TVA payée à l'achat. Faux pour un magasin qui ne
   récupérerait pas la TVA (voir section 11 pour inverser).
2. **Transport à parts égales par article**, sans tenir compte du volume, du poids ou de la valeur. Un canapé et
   une chaise du même camion portent la même part.
3. **Douane en pourcentage** calculée sur achat + transport, pas sur une valeur en douane officielle.
4. **Charges réparties au prorata du prix de vente.** Le taux dépend entièrement du chiffre d'affaires de
   référence : un objectif optimiste fait baisser artificiellement les prix conseillés.
5. **Analyse de rentabilité fondée sur une marge brute visée**, pas sur la marge réelle du catalogue. Tant que les
   prix d'achat ne sont pas saisis, la marge réelle est inconnue.
6. **Cotisations patronales à 0 par défaut.** Avec des salaires bruts, les charges sont sous-estimées.
7. **Charges à venir ou temporaires** (postes « à recruter », leasing qui se termine) : comptées comme les
   autres tant qu'elles figurent dans la liste. Il n'y a pas de date de début ni de fin.
8. **Marge des ventes** : seulement sur les commandes créées après la saisie des coûts ; frais de livraison et
   prestations exclus.
9. **Valeur du stock de l'onglet Stock** : au prix de vente **TTC**, alors que l'onglet Coûts donne la valeur de
   vente **HT**. Les deux libellés le précisent.
10. **Seuil de rentabilité d'un produit** (fiche produit) : nombre de pièces de ce seul produit dont la marge
    couvrirait toutes les charges. C'est un ordre de grandeur, pas un objectif réaliste.

---

## 14. Vérifications faites lors de l'écriture de ce document

Le moteur a été relu en entier puis contrôlé de trois façons.

**1. Cas calculés à la main** — 93 cas (sections A à E, plus les cas limites : valeurs négatives, prix
manquants, réglages extrêmes, transport supprimé, postes à 0). Tous exacts.

**2. Propriétés vérifiées sur des cas aléatoires** — 40 000 produits et réglages tirés au hasard, 4 000
configurations de transports, soit 1,2 million de contrôles. Ces propriétés doivent rester vraies après toute
modification :

- toutes les valeurs sont finies et positives, quels que soient les réglages ;
- sous-total = achat + transport + frais + postes ; TVA = 20 % du sous-total ; la douane ne change jamais la TVA ;
- coût total TTC = sous-total + TVA + douane ; coût de revient = sous-total + douane ;
- sans prix d'achat, tout est à zéro et aucun prix n'est conseillé ;
- marge = prix HT − coût de revient − frais de vente ; coefficient TTC = coefficient HT × 1,20 ; taux de marque < 100 % ;
- taux de charges entre 0 et 90 % ; les cotisations patronales n'abaissent jamais les charges ;
- au seuil de rentabilité, la marge couvre exactement les charges ; bénéfice ⇔ CA au-dessus du seuil ⇔ marge
  visée ≥ marge nécessaire ;
- prix conseillé ≥ prix plancher ≥ coût de revient ; l'arrondi ne fait que monter, d'au plus un pas ;
- au prix plancher, le bénéfice net est nul ; au prix conseillé exact, il reste le bénéfice visé ;
- augmenter le prix de vente ne dégrade jamais la situation ; « prix rentable » ⇒ bénéfice net ≥ bénéfice visé ;
- augmenter les charges ne fait jamais baisser le prix conseillé ;
- tous les articles d'un même transport portent la même part, et la somme des parts redonne son coût.

Précision : les prix sont arrondis au centime. Sur un produit à quelques euros, cet arrondi décale le bénéfice
obtenu au prix conseillé de quelques centièmes de point par rapport au bénéfice visé (0,02 point pour un
produit à 9 €). C'est attendu.

**3. Cohérence entre les écrans** — dans un navigateur, pour chaque produit : même coût de revient, même marge
et même prix de vente dans les onglets Stock, Coûts et PVC et dans la fiche produit ; totaux de pied de tableau
égaux à la somme des lignes ; somme des parts d'un transport égale à son coût.

### Défauts corrigés à cette occasion

| Constat | Correction |
|---|---|
| **Modifier un produit par le formulaire de l'onglet Stock remettait à zéro sa douane, ses autres frais, ses postes de coût et son transport numéroté.** | `updateArticle` ne modifie que les champs envoyés (section 10). |
| Un transport saisi à la main sur un produit rattaché à un camion était enregistré mais sans effet. | Le produit sort de son transport numéroté (section 4). |
| Un prix situé entre le prix conseillé exact et son arrondi était classé « sous le prix conseillé » alors que le bénéfice visé était atteint. | La situation se juge sur le prix conseillé exact. |
| La moyenne des ventes réelles incluait le mois en cours, incomplet, ce qui gonflait le taux de charges en début de mois. | Le mois en cours est ignoré dès qu'un mois complet existe. |
| La marge du tableau des ventes ne retirait pas les frais de vente (commission, carte), contrairement à la marge des produits. | Les frais de vente sont figés sur la ligne de commande (`salesRate`) et déduits. |
| Le taux de TVA était écrit à deux endroits (constante et valeurs par défaut des fonctions). | Une seule constante, `VAT_RATE`. |

---

## Cockpit des ventes (`/commandes/ventes`)

Fichiers : `lib/orders/cockpit.ts` (tous les calculs, fonctions pures), `components/orders/Cockpit.tsx` (affichage, filtre de période), `app/commandes/ventes/page.tsx` (bloc « En ce moment »).

**Principe.** `buildFacts` résume une fois chaque commande **non annulée** (les annulées ne sont que comptées). `analyse(facts, période, découpage)` regroupe ensuite ces résumés par **jour, semaine (lundi → dimanche) ou mois**. Toutes les dates sont à l'heure de Paris.

| Chiffre | Règle |
|---|---|
| Ventes TTC | total de la commande (articles − remise + livraison + prestations ajoutées), **à la date de création** |
| Commandes, panier moyen | nombre de commandes ; ventes ÷ commandes |
| Encaissé | paiements **à leur date réelle** (acompte, solde livreur) ; un montant réglé sans détail est daté du jour de la commande et classé « Non précisé » |
| Marge brute HT | par ligne : `prix HT × (1 − frais de vente) − coût de revient × quantité`, uniquement si le coût était connu le jour de la vente (`unitCost` figé sur la ligne) ; la remise de la commande est répartie au prorata. Le taux affiché = marge ÷ ventes HT **dont le coût est connu** |
| Livraisons effectuées | comptées le jour où la commande passe à « terminée » (`doneAt`), même si la commande est plus ancienne ; délai moyen = jours entre création et livraison |
| Clients nouveaux / déjà clients | client identifié par son téléphone (sinon son nom) ; nouveau = sa toute première commande est dans la période |
| Période d'avant | même durée juste avant (7/30/90 jours, 12 mois) ; pour « Cette année » : la même partie de l'année précédente ; aucune pour « Depuis le début » |
| Cumul | somme des ventes depuis le début de la période ; la courbe grise est la période d'avant décalée jour pour jour |
| Découpage | au-delà de 100 barres, « par jour » passe automatiquement à « par semaine », puis « par mois » |

**Bloc « En ce moment »** (ne dépend pas du filtre) : aujourd'hui vs hier ; semaine depuis lundi vs semaine dernière arrêtée au même jour ; mois vs mois dernier arrêté au même jour.
**Objectif du mois** : ventes du mois HT (`TTC ÷ 1,20`, livraison comprise) comparées au seuil de rentabilité `charges fixes ÷ marge brute visée` (même calcul que la page Charges). Projection fin de mois = `ventes HT ÷ jours écoulés × jours du mois` (simple règle de trois, sans saisonnalité).
**Valeur du stock** : `stock × prix de vente TTC` ; en coût de revient : `stock × coût de revient HT` (0 pour les produits sans prix d'achat, donc sous-estimé tant que les prix d'achat manquent).

Contrôles vérifiés par test : somme des barres = total de la période, pour chaque découpage et chaque période ; dernier point du cumul = ventes ; jours de semaine, heures et moyens de paiement retombent sur les mêmes totaux.

---

## Cockpit des frais (`/stock/frais`)

Fichiers : `app/stock/frais/page.tsx` (calculs, côté serveur) et `components/orders/FraisCharts.tsx` (graphiques). Aucune formule nouvelle : la page réutilise `chargeRate`, `profitability`, `chargesByCategory`, `transportTotals` et `costBreakdown`.

| Chiffre | Règle |
|---|---|
| Charges par jour | `charges mensuelles × 12 ÷ 365` (jours calendaires, magasin ouvert ou fermé) |
| Seuil de rentabilité | `charges mensuelles ÷ marge brute visée` (HT) ; en TTC `× 1,20` |
| Sur 100 € payés | TVA `100 − 100 ÷ 1,20` ; marchandises `(100 ÷ 1,20) × (1 − marge brute visée)` ; charges `(100 ÷ 1,20) × charges ÷ CA HT de référence` ; bénéfice = le reste (s'il est négatif, un message indique ce qui manque) |
| Courbe du seuil | marge brute = `ventes HT × marge visée` (droite qui monte) face aux charges fixes (droite plate) ; elles se croisent au seuil |
| Résultat estimé d'un mois | `ventes HT réelles du mois × marge visée − charges fixes`. C'est une **estimation** : la marge réelle n'est connue que pour les articles ayant un prix d'achat. Les mois antérieurs à la première commande ne sont pas évalués |
| Coût du stock | `coût de revient HT × pièces en stock` par produit chiffré (un produit à zéro compte pour une pièce), ventilé par nature (achat, transport, douane, frais, postes), par fournisseur et par famille |
