import { randomUUID } from "node:crypto";
import { DELIVERY_MODES, cleanTime, orderTotals, parisToday, slotOfTime } from "./logic";
import type { Article, Db, Order, OrderInput } from "./types";

/** Briques communes à la création d'articles et de commandes (utilisées par les actions et par la simulation). */

export const id = () => randomUUID().replace(/-/g, "").slice(0, 12);
export const now = () => new Date().toISOString();
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const clean = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);
export const frDate = (date: string) => date.split("-").reverse().join("/");
export const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

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

export function makeArticle(db: Db, input: { name: unknown; reference: unknown; price: unknown; stock: unknown }): Article {
  const name = clean(input.name, 120);
  if (!name) throw new UserError("Le nom de l'article est obligatoire.");
  const stock = Math.max(0, Math.floor(Number(input.stock) || 0));
  const article: Article = {
    id: id(),
    name,
    reference: clean(input.reference, 40),
    price: parsePrice(input.price, "Prix"),
    stock,
    createdAt: now(),
  };
  db.articles.push(article);
  return article;
}


/** Ajoute une commande à la base en mémoire : contrôle les données, réserve le stock, attribue le numéro. */
export function insertOrder(db: Db, input: OrderInput, prefix: string): Order {
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
    // Le stock est réservé tout de suite s'il suffit ; sinon la ligne passe « en attente ».
    const reserved = article.stock >= quantity;
    if (reserved) article.stock -= quantity;
    return {
      id: id(),
      articleId: article.id,
      name: article.name,
      reference: article.reference,
      unitPrice: article.price,
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
    history: [],
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
