import { randomUUID } from "node:crypto";
import { DELIVERY_MODES, articleLabel, cleanTime, orderTotals, parisToday, slotOfTime, unitCost } from "./logic";
import { transportTotals, type CostItem, type Transport } from "./pricing";
import type { Article, Db, Order, OrderInput } from "./types";

/** Briques communes à la création d'articles et de commandes (utilisées par les actions et par la simulation). */

export const id = () => randomUUID().replace(/-/g, "").slice(0, 12);
/** Jeton impossible à deviner pour le lien de signature. */
export const signToken = () => randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 8);
export const now = () => new Date().toISOString();
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const clean = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);
export const frDate = (date: string) => date.split("-").reverse().join("/");
/** Date AAAA-MM-JJ qui existe vraiment (pas de 31 février). */
export const isDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T12:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

export const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

export class UserError extends Error {}

export function log(order: Order, text: string) {
  order.history.push({ at: now(), text });
}

export function parsePrice(value: unknown, label: string): number {
  const n = round2(Number(value));
  if (!Number.isFinite(n) || n < 0) throw new UserError(`${label} invalide.`);
  return n;
}

export function parseQuantity(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > 9999) throw new UserError("Quantité invalide.");
  return n;
}

/** Champs descriptifs d'un article, nettoyés. La référence, si elle est renseignée, doit être unique. */
export function articleFields(db: Db, input: { name: unknown; reference: unknown; price: unknown; cost?: unknown; transport?: unknown; truckCost?: unknown; truckUnits?: unknown; truckId?: unknown; truckQty?: unknown; customsRate?: unknown; customsFixed?: unknown; fees?: unknown; extras?: unknown; supplier?: unknown; category?: unknown; dimensions?: unknown; color?: unknown }, selfId?: string) {
  const name = clean(input.name, 120);
  if (!name) throw new UserError("Le nom de l'article est obligatoire.");
  const reference = clean(input.reference, 120);
  if (reference && db.articles.some((a) => a.id !== selfId && a.reference.toLowerCase() === reference.toLowerCase())) {
    throw new UserError(`La référence « ${reference} » est déjà utilisée par un autre article.`);
  }
  return { name, reference, category: clean(input.category, 60), dimensions: clean(input.dimensions, 80), color: clean(input.color, 80), price: parsePrice(input.price, "Prix"), cost: parsePrice(input.cost ?? 0, "Prix d'achat"), transport: parsePrice(input.transport ?? 0, "Frais de transport"), supplier: clean(input.supplier, 80), ...costFields(input) };
}

/** Camion, douane et autres frais : montants positifs, 0 par défaut. */
export function costFields(input: { truckCost?: unknown; truckUnits?: unknown; truckId?: unknown; truckQty?: unknown; customsRate?: unknown; customsFixed?: unknown; fees?: unknown; extras?: unknown }) {
  // Postes de coût propres au produit : identifiant → valeur positive. Tout le reste est écarté.
  const extras: Record<string, number> = {};
  if (input.extras && typeof input.extras === "object") {
    for (const [key, value] of Object.entries(input.extras as Record<string, unknown>).slice(0, 60)) {
      const n = Number(value);
      if (/^[A-Za-z0-9_-]{1,24}$/.test(key) && Number.isFinite(n) && n >= 0 && n <= 1_000_000) extras[key] = round2(n);
    }
  }
  const customsRate = Number(input.customsRate ?? 0) || 0;
  if (customsRate < 0 || customsRate > 100) throw new UserError("Le taux de douane doit être compris entre 0 et 100 %.");
  return {
    truckCost: parsePrice(input.truckCost ?? 0, "Coût du camion"),
    truckUnits: Math.min(999999, Math.max(0, Math.floor(Number(input.truckUnits ?? 0) || 0))),
    truckId: /^[A-Za-z0-9_-]{1,24}$/.test(String(input.truckId ?? "")) ? String(input.truckId) : "",
    truckQty: Math.min(999999, Math.max(0, Math.floor(Number(input.truckQty ?? 0) || 0))),
    customsRate: round2(customsRate),
    customsFixed: parsePrice(input.customsFixed ?? 0, "Frais de douane"),
    fees: parsePrice(input.fees ?? 0, "Autres frais"),
    extras,
  };
}

export function makeArticle(db: Db, input: { name: unknown; reference: unknown; price: unknown; cost?: unknown; transport?: unknown; truckCost?: unknown; truckUnits?: unknown; truckId?: unknown; truckQty?: unknown; customsRate?: unknown; customsFixed?: unknown; fees?: unknown; extras?: unknown; supplier?: unknown; stock: unknown; category?: unknown; dimensions?: unknown; color?: unknown }): Article {
  const fields = articleFields(db, input);
  const stock = Math.max(0, Math.floor(Number(input.stock) || 0));
  const article: Article = {
    id: id(),
    ...fields,
    stock,
    createdAt: now(),
  };
  db.articles.push(article);
  return article;
}


/** Ajoute une commande à la base en mémoire : contrôle les données, réserve le stock, attribue le numéro. */
export function insertOrder(db: Db, input: OrderInput, prefix: string, costItems: CostItem[] = [], transports: Transport[] = []): Order {
  // Part de transport de chaque article, d'après les camions enregistrés (calculée une fois pour toute la commande).
  const trucks = transportTotals(db.articles, transports);
  const resolved = (article: Article): Article => {
    const entry = article.truckId ? trucks.get(article.truckId) : undefined;
    return entry && entry.units > 0 ? { ...article, truckCost: entry.transport.cost, truckUnits: entry.units } : article;
  };
  const name = clean(input.customer?.name, 120);
  if (!name) throw new UserError("Le nom du client est obligatoire.");
  const mode = input.delivery?.mode;
  if (!mode || !(mode in DELIVERY_MODES)) throw new UserError("Choisissez un mode de livraison.");
  const customer = {
    name,
    phone: clean(input.customer.phone, 30),
    email: clean(input.customer.email, 120),
    address: clean(input.customer.address),
    postalCode: clean(input.customer.postalCode, 10),
    city: clean(input.customer.city, 80),
    notes: clean(input.customer.notes, 500),
  };
  if (customer.email && !EMAIL.test(customer.email)) throw new UserError("L'adresse e-mail du client est invalide.");
  if (mode !== "retrait" && (!customer.address || !customer.city)) {
    throw new UserError("L'adresse et la ville sont obligatoires pour une livraison.");
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new UserError("Ajoutez au moins un article.");

  const lines: Order["lines"] = input.lines.map((line) => {
    const quantity = parseQuantity(line.quantity);
    const article = line.newArticle
      ? makeArticle(db, line.newArticle)
      : db.articles.find((a) => a.id === line.articleId);
    if (!article) throw new UserError("Un article sélectionné n'existe plus.");
    // Article de l'inventaire encore sans prix : celui saisi sur le bon est enregistré sur sa fiche.
    if (article.price === 0 && line.price !== undefined) article.price = parsePrice(line.price, `Prix de « ${article.name} »`);
    if (article.price <= 0) throw new UserError(`Indiquez le prix de « ${articleLabel(article)} ».`);
    // Le stock est réservé tout de suite s'il suffit ; sinon la ligne passe « en attente ».
    const reserved = article.stock >= quantity;
    if (reserved) article.stock -= quantity;
    return {
      id: id(),
      articleId: article.id,
      name: articleLabel(article),
      reference: article.reference,
      unitPrice: article.price,
      unitCost: unitCost(resolved(article), costItems),
      quantity,
      reserved,
    };
  });

  const year = Number(parisToday().slice(0, 4));
  const sequence = (db.counters[`${prefix}-${year}`] ?? 0) + 1;
  db.counters[`${prefix}-${year}`] = sequence;

  const discountType = input.discount?.type === "amount" ? "amount" : "percent";
  const scheduledDate = isDate(input.scheduledDate) ? input.scheduledDate : null;
  const time = scheduledDate ? cleanTime(input.time) : "";
  const order: Order = {
    id: id(),
    number: `${prefix}-${year}-${String(sequence).padStart(4, "0")}`,
    createdAt: now(),
    shop: input.shop === "paris" ? "paris" : "toulouse",
    observations: clean(input.observations, 500),
    paid: 0,
    payments: [],
    extras: [],
    customer,
    lines,
    discount: { type: discountType, value: Math.max(0, round2(Number(input.discount?.value) || 0)) },
    delivery: {
      mode,
      basePrice: DELIVERY_MODES[mode].price,
      adjustment: mode === "retrait" ? 0 : round2(Number(input.delivery.adjustment) || 0),
      offered: mode !== "retrait" && Boolean(input.delivery.offered),
    },
    scheduledDate,
    slot: time ? slotOfTime(time) : scheduledDate && (input.slot === "matin" || input.slot === "apres-midi") ? input.slot : "",
    time,
    prepared: false,
    preparedAt: null,
    reminded: false,
    status: "active",
    doneAt: null,
    geo: null,
    emails: [],
    history: [],
    signToken: signToken(),
    signature: null,
  };
  const { total } = orderTotals(order);
  order.paid = Math.min(total, Math.max(0, round2(Number(input.paid) || 0)));
  if (order.paid > 0) order.payments.push({ at: now(), amount: order.paid, method: "", by: "magasin" });
  log(order, "Bon de commande créé");
  if (order.paid > 0) log(order, order.paid >= total ? "Commande réglée en totalité" : `Acompte de ${order.paid.toFixed(2).replace(".", ",")} € reçu`);
  const missing = lines.filter((l) => !l.reserved);
  if (missing.length) log(order, `En attente de stock : ${missing.map((l) => `${l.quantity} × ${l.name}`).join(", ")}`);
  if (scheduledDate) log(order, `${mode === "retrait" ? "Retrait planifié" : "Livraison programmée"} le ${frDate(scheduledDate)}`);
  db.orders.push(order);
  return order;
}
