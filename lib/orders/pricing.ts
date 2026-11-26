/**
 * Calculs de coûts, de marges et de prix de vente. Tout se fait hors taxes ; les prix de vente du magasin
 * sont saisis TTC et convertis ici. Ce fichier ne dépend de rien : il s'utilise côté serveur comme dans le navigateur.
 *
 *   coût de revient HT = achat HT + transport (part du camion) + douane + autres frais + postes de coût
 *   frais de vente     = postes exprimés en % du prix de vente (commission, frais de carte bancaire…)
 *   marge brute        = prix de vente HT − coût de revient − frais de vente
 *   taux de charges    = charges fixes du mois ÷ chiffre d'affaires HT du mois
 *   prix plancher HT   = coût de revient ÷ (1 − taux de charges − frais de vente)                 → ni gain ni perte
 *   prix conseillé HT  = coût de revient ÷ (1 − taux de charges − frais de vente − marge visée)   → bénéfice net visé
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const positive = (n: unknown) => Math.max(0, Number(n) || 0);

/**
 * Poste de coût ajouté par le magasin, en plus de l'achat, du transport et de la douane.
 * Sa valeur par défaut vaut pour tous les produits ; chaque produit peut avoir la sienne.
 */
export type CostKind = "euro" | "pct-achat" | "pct-vente";

export interface CostItem {
  id: string;
  label: string;
  /** euro = montant par pièce ; pct-achat = % du prix d'achat ; pct-vente = % du prix de vente HT. */
  kind: CostKind;
  /** Valeur appliquée aux produits qui n'ont pas la leur. */
  value: number;
}

export const KIND_LABEL: Record<CostKind, string> = { euro: "€ par pièce", "pct-achat": "% du prix d'achat", "pct-vente": "% du prix de vente HT" };

/** Ce qu'il faut connaître d'un produit pour calculer son coût. Tout est facultatif sauf le prix d'achat. */
export interface CostInput {
  /** Prix d'achat HT d'une pièce. */
  cost?: number;
  /** Transport par pièce saisi directement (utilisé quand aucun camion n'est renseigné). */
  transport?: number;
  /** Coût total du camion (ou du conteneur) qui a livré l'article… */
  truckCost?: number;
  /** …et nombre total d'articles qu'il transportait : le coût est divisé entre eux. */
  truckUnits?: number;
  /** Droits de douane, en % du prix d'achat + transport. */
  customsRate?: number;
  /** Frais de douane en euros par pièce (s'ajoutent au pourcentage). */
  customsFixed?: number;
  /** Autres frais par pièce (manutention, emballage, assurance…). */
  fees?: number;
  /** Valeur propre à ce produit pour un poste de coût (identifiant du poste → valeur). */
  extras?: Record<string, number>;
}

export interface ExtraLine {
  id: string;
  label: string;
  kind: CostKind;
  /** Valeur retenue (celle du produit, sinon celle par défaut) et montant en euros qui en découle. */
  value: number;
  amount: number;
  /** true = valeur propre au produit ; false = valeur par défaut du poste. */
  own: boolean;
}

export interface CostBreakdown {
  purchase: number;
  transport: number;
  customs: number;
  fees: number;
  /** Postes en euros ou en % de l'achat : ils entrent dans le coût de revient. */
  extras: ExtraLine[];
  extrasTotal: number;
  /** Postes en % du prix de vente : leur total, en proportion (0,015 = 1,5 %). */
  salesItems: ExtraLine[];
  salesRate: number;
  /** Sous-total HT soumis à la TVA : achat + transport + autres frais + postes. La douane n'en fait pas partie. */
  subtotal: number;
  /** TVA sur ce sous-total (jamais sur la douane). */
  vat: number;
  /** Coût total d'une pièce, TVA comprise : sous-total + TVA + douane. */
  totalTtc: number;
  /**
   * Coût de revient HT d'une pièce : sous-total + douane. C'est lui qui sert au calcul des marges, la TVA payée
   * à l'achat étant récupérée. 0 tant que le prix d'achat n'est pas renseigné.
   */
  total: number;
}

/** Taux de TVA appliqué aux achats comme aux ventes. */
export const VAT_RATE = 20;

/** Valeur d'un poste pour un produit : la sienne si elle est saisie, sinon celle par défaut. */
export function itemValue(article: CostInput, item: CostItem): { value: number; own: boolean } {
  const own = article.extras?.[item.id];
  return own !== undefined && own !== null && Number.isFinite(Number(own)) ? { value: positive(own), own: true } : { value: positive(item.value), own: false };
}

/** Transport d'une pièce : part du camion si le camion est renseigné, sinon le montant saisi à la main. */
export function transportPerUnit(article: CostInput): number {
  const cost = positive(article.truckCost);
  const units = Math.floor(positive(article.truckUnits));
  return cost > 0 && units > 0 ? round2(cost / units) : round2(positive(article.transport));
}

/** Détail du coût de revient d'une pièce. `items` : les postes de coût ajoutés par le magasin. */
export function costBreakdown(article: CostInput, items: CostItem[] = []): CostBreakdown {
  const purchase = round2(positive(article.cost));
  const salesItems: ExtraLine[] = items
    .filter((item) => item.kind === "pct-vente")
    .map((item) => ({ id: item.id, label: item.label, kind: item.kind, ...itemValue(article, item), amount: 0 }))
    .filter((line) => line.value > 0);
  const salesRate = Math.min(0.9, salesItems.reduce((total, line) => total + line.value, 0) / 100);
  if (purchase <= 0) return { purchase: 0, transport: 0, customs: 0, fees: 0, extras: [], extrasTotal: 0, salesItems, salesRate, subtotal: 0, vat: 0, totalTtc: 0, total: 0 };
  const transport = transportPerUnit(article);
  // Douane : un pourcentage de l'achat et du transport, et/ou un montant par pièce. Elle vient en plus, sans TVA.
  const customs = round2(((purchase + transport) * Math.min(100, positive(article.customsRate))) / 100 + positive(article.customsFixed));
  const fees = round2(positive(article.fees));
  const extras: ExtraLine[] = items
    .filter((item) => item.kind !== "pct-vente")
    .map((item) => {
      const { value, own } = itemValue(article, item);
      return { id: item.id, label: item.label, kind: item.kind, value, own, amount: round2(item.kind === "euro" ? value : (purchase * value) / 100) };
    })
    .filter((line) => line.amount > 0);
  const extrasTotal = round2(extras.reduce((total, line) => total + line.amount, 0));
  const subtotal = round2(purchase + transport + fees + extrasTotal);
  const vat = round2((subtotal * VAT_RATE) / 100);
  return { purchase, transport, customs, fees, extras, extrasTotal, salesItems, salesRate, subtotal, vat, totalTtc: round2(subtotal + vat + customs), total: round2(subtotal + customs) };
}

/** Coût de revient HT d'une pièce (0 = inconnu). */
export const landedCost = (article: CostInput, items: CostItem[] = []) => costBreakdown(article, items).total;

/** Prix TTC → HT, et inversement. `vatRate` en % (VAT_RATE par défaut). */
export const exVat = (priceTtc: number, vatRate = VAT_RATE) => round2(positive(priceTtc) / (1 + positive(vatRate) / 100));
export const inclVat = (priceHt: number, vatRate = VAT_RATE) => round2(positive(priceHt) * (1 + positive(vatRate) / 100));

export interface Margin {
  /** Coût de revient HT. */
  cost: number;
  /** Prix de vente HT. */
  priceHt: number;
  /** TVA collectée sur la vente (reversée à l'État). */
  vat: number;
  /** Frais de vente : postes en % du prix de vente (commission, carte bancaire…). */
  salesCosts: number;
  /** Marge brute : prix de vente HT − coût de revient − frais de vente. */
  amount: number;
  /** Taux de marque : part du prix de vente HT qui reste en marge. */
  rate: number;
  /** Taux de marge : marge rapportée au coût de revient. */
  markup: number;
  /** Coefficient multiplicateur : prix de vente TTC ÷ coût de revient. */
  coefficient: number;
  /** Coefficient hors taxes : prix de vente HT ÷ coût de revient. */
  coefficientHt: number;
}

/** Marge brute d'un produit. null tant que le prix d'achat ou le prix de vente manque. */
export function margin(article: CostInput & { price: number }, vatRate = VAT_RATE, items: CostItem[] = []): Margin | null {
  const breakdown = costBreakdown(article, items);
  const cost = breakdown.total;
  if (cost <= 0 || !(article.price > 0)) return null;
  const priceHt = exVat(article.price, vatRate);
  const salesCosts = round2(priceHt * breakdown.salesRate);
  const amount = round2(priceHt - cost - salesCosts);
  return { cost, priceHt, vat: round2(article.price - priceHt), salesCosts, amount, rate: priceHt > 0 ? amount / priceHt : 0, markup: amount / cost, coefficient: article.price / cost, coefficientHt: priceHt / cost };
}

/* ───────────────────────── Charges fixes ───────────────────────── */

export type ChargePeriod = "mois" | "trimestre" | "an";

export type ChargeCategory = "loyer" | "salaire" | "energie" | "vehicule" | "service" | "autre";

export const CATEGORY_LABEL: Record<ChargeCategory, string> = { loyer: "Loyers", salaire: "Salaires", energie: "Énergie", vehicule: "Véhicules", service: "Services et frais", autre: "Autres" };

/** Devine la famille d'une charge à partir de son nom (utilisé à l'import d'un fichier et pour les anciennes saisies). */
export function guessCategory(label: string): ChargeCategory {
  const text = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/loyer|bail|location local/.test(text)) return "loyer";
  if (/assurance/.test(text)) return "service";
  if (/salaire|salari|cotisation|urssaf|paie|recruter|vendeu|chauffeur|monteur|responsable|menage|employe/.test(text)) return "salaire";
  if (/electricit|\beau\b|chauffage|gaz|energie/.test(text)) return "energie";
  if (/carburant|leasing|loa|camion|vehicule|fourgon|essence|gasoil|peage/.test(text)) return "vehicule";
  if (/assurance|comptable|logiciel|abonnement|banc|telephon|internet|marketing|publicit|fourniture|honoraire/.test(text)) return "service";
  return "autre";
}

export interface Charge {
  id: string;
  label: string;
  amount: number;
  period: ChargePeriod;
  category: ChargeCategory;
  note: string;
}

/** Un camion ou un conteneur : son coût est réparti entre tous les articles qu'il a livrés. */
export interface Transport {
  id: string;
  /** Numéro ou nom donné par le magasin (ex. « CAM-012 », « Conteneur Turquie mars »). */
  number: string;
  /** Date d'arrivée, AAAA-MM-JJ (facultative). */
  date: string;
  /** Coût total HT du transport. */
  cost: number;
  note: string;
}

export interface TransportTotals {
  transport: Transport;
  /** Nombre de produits différents et nombre total d'articles transportés. */
  products: number;
  units: number;
  /** Part de chaque article : coût ÷ nombre d'articles. */
  perUnit: number;
}

/** Pour chaque transport : combien de produits et d'articles lui sont rattachés, et la part par article. */
export function transportTotals(articles: { truckId?: string; truckQty?: number }[], transports: Transport[]): Map<string, TransportTotals> {
  const totals = new Map<string, TransportTotals>(transports.map((transport) => [transport.id, { transport, products: 0, units: 0, perUnit: 0 }]));
  for (const article of articles) {
    const entry = article.truckId ? totals.get(article.truckId) : undefined;
    if (!entry) continue;
    entry.products += 1;
    entry.units += Math.max(1, Math.floor(positive(article.truckQty)));
  }
  for (const entry of totals.values()) entry.perUnit = entry.units > 0 ? round2(positive(entry.transport.cost) / entry.units) : 0;
  return totals;
}

/**
 * Renvoie les articles avec le coût et le nombre d'articles de leur transport reportés dans truckCost / truckUnits :
 * tous les calculs de coût fonctionnent ensuite sans connaître les transports.
 * Un article rattaché à un transport supprimé retombe sur ses valeurs saisies à la main.
 */
export function withTransports<T extends { truckId?: string; truckQty?: number; truckCost?: number; truckUnits?: number }>(articles: T[], transports: Transport[]): T[] {
  if (transports.length === 0) return articles;
  const totals = transportTotals(articles, transports);
  return articles.map((article) => {
    const entry = article.truckId ? totals.get(article.truckId) : undefined;
    return entry && entry.units > 0 ? { ...article, truckCost: positive(entry.transport.cost), truckUnits: entry.units } : article;
  });
}

export interface PricingSettings {
  charges: Charge[];
  /** Camions et conteneurs reçus. */
  transports: Transport[];
  /** Postes de coût ajoutés par le magasin (emballage, commission, SAV…). */
  costItems: CostItem[];
  /** Chiffre d'affaires mensuel prévu. 0 = moyenne des ventes réelles des derniers mois. */
  monthlyRevenue: number;
  /** Le chiffre d'affaires prévu est-il saisi hors taxes (comme en comptabilité) ou TTC ? */
  revenueBasis: "ht" | "ttc";
  /** Cotisations patronales ajoutées aux salaires bruts, en %. 0 = les salaires saisis sont déjà le coût complet. */
  employerRate: number;
  /** Marge brute que le magasin vise sur ses ventes, en % du prix HT (sert à l'analyse de rentabilité). */
  grossMarginTarget: number;
  /** Bénéfice net visé sur chaque vente, en % du prix de vente HT. */
  targetMargin: number;
  /** Arrondi des prix conseillés : au multiple supérieur (10 = dizaine). 0 = pas d'arrondi. */
  rounding: number;
}

export const DEFAULT_PRICING: PricingSettings = { charges: [], transports: [], costItems: [], monthlyRevenue: 0, revenueBasis: "ttc", employerRate: 0, grossMarginTarget: 38, targetMargin: 15, rounding: 10 };

export const PERIOD_LABEL: Record<ChargePeriod, string> = { mois: "par mois", trimestre: "par trimestre", an: "par an" };
const PER_MONTH: Record<ChargePeriod, number> = { mois: 1, trimestre: 1 / 3, an: 1 / 12 };

/**
 * Montant d'une charge ramené au mois. Pour un salaire, `employerRate` ajoute les cotisations patronales
 * (un salaire brut de 2 000 € avec 42 % de cotisations coûte 2 840 € au magasin).
 */
export const monthlyAmount = (charge: Pick<Charge, "amount" | "period"> & { category?: ChargeCategory }, employerRate = 0) =>
  round2(positive(charge.amount) * (PER_MONTH[charge.period] ?? 1) * (charge.category === "salaire" ? 1 + Math.min(100, positive(employerRate)) / 100 : 1));
export const monthlyCharges = (charges: Charge[], employerRate = 0) => round2(charges.reduce((total, charge) => total + monthlyAmount(charge, employerRate), 0));

/** Total mensuel par famille de charges, du plus lourd au plus léger. */
export function chargesByCategory(charges: Charge[], employerRate = 0): { category: ChargeCategory; monthly: number; count: number }[] {
  const map = new Map<ChargeCategory, { monthly: number; count: number }>();
  for (const charge of charges) {
    const entry = map.get(charge.category) ?? { monthly: 0, count: 0 };
    entry.monthly = round2(entry.monthly + monthlyAmount(charge, employerRate));
    entry.count += 1;
    map.set(charge.category, entry);
  }
  return [...map.entries()].map(([category, entry]) => ({ category, ...entry })).sort((a, b) => b.monthly - a.monthly);
}

export interface ChargeRate {
  /** Total des charges fixes ramené au mois. */
  monthly: number;
  /** Chiffre d'affaires HT mensuel servant de base. */
  revenueHt: number;
  /** Part de chaque euro vendu (HT) qui part dans les charges fixes. Plafonnée à 90 %. */
  rate: number;
  /** La base de chiffre d'affaires est-elle connue ? Sans elle, les charges ne peuvent pas être réparties. */
  known: boolean;
}

/** Poids des charges fixes dans chaque vente. */
export function chargeRate(settings: PricingSettings, averageRevenueTtc: number, vatRate = VAT_RATE): ChargeRate {
  const monthly = monthlyCharges(settings.charges, settings.employerRate);
  // Objectif saisi : hors taxes ou TTC selon le réglage ; sinon, la moyenne des ventes réelles (toujours TTC).
  const revenueHt = settings.monthlyRevenue > 0 ? (settings.revenueBasis === "ht" ? round2(settings.monthlyRevenue) : exVat(settings.monthlyRevenue, vatRate)) : exVat(positive(averageRevenueTtc), vatRate);
  if (monthly <= 0) return { monthly: 0, revenueHt, rate: 0, known: true };
  if (revenueHt <= 0) return { monthly, revenueHt: 0, rate: 0, known: false };
  return { monthly, revenueHt, rate: Math.min(0.9, monthly / revenueHt), known: true };
}

export type PriceStatus = "sans-cout" | "sans-prix" | "perte" | "sous-plancher" | "sous-conseille" | "ok";

export interface Recommendation {
  cost: number;
  /** Prix plancher : en dessous, la vente coûte de l'argent une fois les charges payées. */
  floorHt: number;
  floorTtc: number;
  /** Prix de vente conseillé pour atteindre le bénéfice net visé. */
  advisedHt: number;
  advisedTtc: number;
  /** Frais de vente en proportion du prix (postes en % du prix de vente). */
  salesRate: number;
  /** Au prix de vente actuel : frais de vente, part de charges fixes, puis bénéfice net. null sans prix de vente. */
  current: { priceHt: number; salesCosts: number; charges: number; net: number; netRate: number } | null;
  status: PriceStatus;
}

const roundUp = (value: number, step: number) => (step > 0 ? Math.ceil(round2(value) / step) * step : round2(value));

/** Prix plancher et prix de vente conseillé d'un produit. null tant que son prix d'achat n'est pas renseigné. */
export function recommend(article: CostInput & { price: number }, charges: ChargeRate, settings: Pick<PricingSettings, "targetMargin" | "rounding"> & { costItems?: CostItem[] }, vatRate = VAT_RATE): Recommendation | null {
  const breakdown = costBreakdown(article, settings.costItems ?? []);
  const cost = breakdown.total;
  if (cost <= 0) return null;
  const salesRate = breakdown.salesRate;
  const target = Math.min(80, positive(settings.targetMargin)) / 100;
  // Charges, frais de vente et marge visée ne peuvent pas absorber tout le prix : on garde au moins 5 % pour le produit.
  const floorHt = round2(cost / Math.max(0.05, 1 - charges.rate - salesRate));
  const advisedHt = round2(cost / Math.max(0.05, 1 - charges.rate - salesRate - target));
  const floorTtc = inclVat(floorHt, vatRate);
  const advisedTtc = roundUp(inclVat(advisedHt, vatRate), settings.rounding);
  let current: Recommendation["current"] = null;
  let status: PriceStatus = "sans-prix";
  if (article.price > 0) {
    const priceHt = exVat(article.price, vatRate);
    const share = round2(priceHt * charges.rate);
    const salesCosts = round2(priceHt * salesRate);
    const net = round2(priceHt - cost - salesCosts - share);
    current = { priceHt, salesCosts, charges: share, net, netRate: priceHt > 0 ? net / priceHt : 0 };
    // « Prix rentable » dès que le bénéfice visé est atteint : on compare au prix conseillé exact, pas à son arrondi
    // (un prix de 1 058 € pour un conseillé de 1 056 € arrondi à 1 060 € est bien rentable).
    status = priceHt < cost ? "perte" : article.price < floorTtc ? "sous-plancher" : article.price < inclVat(advisedHt, vatRate) ? "sous-conseille" : "ok";
  }
  return { cost, floorHt, floorTtc, advisedHt, advisedTtc, salesRate, current, status };
}

export const STATUS_LABEL: Record<PriceStatus, string> = {
  "sans-cout": "Coût à renseigner",
  "sans-prix": "Prix à fixer",
  perte: "Vendu à perte",
  "sous-plancher": "Sous le prix plancher",
  "sous-conseille": "Sous le prix conseillé",
  ok: "Prix rentable",
};

/* ───────────────────────── Analyse de rentabilité ───────────────────────── */

export interface Profitability {
  /** Charges fixes du mois et chiffre d'affaires HT de référence. */
  charges: number;
  revenueHt: number;
  /** Marge brute retenue pour l'analyse (0,38 = 38 %). */
  grossRate: number;
  /** Marge brute en euros au chiffre d'affaires de référence, puis résultat une fois les charges payées. */
  grossMargin: number;
  result: number;
  /** Chiffre d'affaires HT mensuel à atteindre pour ne rien perdre : charges ÷ taux de marge brute. */
  breakEvenHt: number;
  /** Marge brute minimale pour être à l'équilibre au chiffre d'affaires de référence. */
  requiredRate: number;
  /** Écart entre le chiffre d'affaires de référence et le seuil (positif = marge de sécurité). */
  safety: number;
  /** Coefficient minimal à appliquer au coût de revient HT pour obtenir le prix TTC d'équilibre. */
  floorCoefficient: number;
}

/**
 * Le magasin gagne-t-il de l'argent à son chiffre d'affaires de référence ?
 * Une vente rapporte sa marge brute ; il faut que le total de ces marges dépasse les charges fixes du mois.
 */
export function profitability(charges: ChargeRate, grossMarginPercent: number, vatRate = VAT_RATE): Profitability | null {
  if (!charges.known || charges.revenueHt <= 0) return null;
  const grossRate = Math.min(0.95, positive(grossMarginPercent) / 100);
  const grossMargin = round2(charges.revenueHt * grossRate);
  const breakEvenHt = grossRate > 0 ? round2(charges.monthly / grossRate) : 0;
  return {
    charges: charges.monthly,
    revenueHt: charges.revenueHt,
    grossRate,
    grossMargin,
    result: round2(grossMargin - charges.monthly),
    breakEvenHt,
    requiredRate: charges.monthly / charges.revenueHt,
    safety: round2(charges.revenueHt - breakEvenHt),
    floorCoefficient: (1 + vatRate / 100) / Math.max(0.05, 1 - charges.rate),
  };
}
