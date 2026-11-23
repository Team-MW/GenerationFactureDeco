"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { geocode } from "@/lib/orders/geocode";
import { DELIVERY_MODES, fullAddress, isPickup, isStockComplete, orderTotals, parisToday } from "@/lib/orders/logic";
import { StoreError, loadDb, mutate } from "@/lib/orders/store";
import type { Article, Db, Order, OrderInput, Result, Slot } from "@/lib/orders/types";
import { getSettings } from "@/lib/settings";
import { ACCESS_COOKIE, accessPassword, accessToken } from "@/lib/access";

const id = () => randomUUID().replace(/-/g, "").slice(0, 12);
const now = () => new Date().toISOString();
const round2 = (n: number) => Math.round(n * 100) / 100;
const clean = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);
const frDate = (date: string) => date.split("-").reverse().join("/");
const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

class UserError extends Error {}

/** Exécute une action et renvoie toujours un résultat lisible par l'interface. */
async function run<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    // Deuxième verrou, en plus du contrôle à l'entrée du site : aucune action sans le code d'accès.
    const password = accessPassword();
    if (password && (await cookies()).get(ACCESS_COOKIE)?.value !== (await accessToken(password))) {
      return { ok: false, error: "Session expirée : reconnectez-vous." };
    }
    const data = await work();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof UserError || error instanceof StoreError) return { ok: false, error: error.message };
    console.error("[commandes]", error);
    return { ok: false, error: "Une erreur est survenue. Réessayez." };
  }
}

function log(order: Order, text: string) {
  order.history.push({ at: now(), text });
}

function findOrder(db: Db, orderId: string): Order {
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw new UserError("Commande introuvable.");
  return order;
}

/**
 * Attribue le stock disponible aux lignes en attente, de la commande la plus ancienne à la plus récente.
 * Appelé après chaque entrée de stock ou annulation.
 */
function allocate(db: Db) {
  const waiting = db.orders
    .filter((o) => o.status === "active")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const order of waiting) {
    const wasComplete = isStockComplete(order);
    for (const line of order.lines) {
      if (line.reserved) continue;
      const article = db.articles.find((a) => a.id === line.articleId);
      if (article && article.stock >= line.quantity) {
        article.stock -= line.quantity;
        line.reserved = true;
        log(order, `Stock disponible : ${line.quantity} × ${line.name} réservé`);
      }
    }
    if (!wasComplete && isStockComplete(order)) log(order, "Tous les articles sont en stock");
  }
}

function parsePrice(value: unknown, label: string): number {
  const n = round2(Number(value));
  if (!Number.isFinite(n) || n < 0) throw new UserError(`${label} invalide.`);
  return n;
}

function parseQuantity(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > 9999) throw new UserError("Quantité invalide.");
  return n;
}

function makeArticle(db: Db, input: { name: unknown; reference: unknown; price: unknown; stock: unknown }): Article {
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

/* ───────────────────────── Articles & stock ───────────────────────── */

export async function createArticle(input: { name: string; reference: string; price: number; stock: number }) {
  return run(() =>
    mutate((db) => {
      const article = makeArticle(db, input);
      allocate(db);
      return article.id;
    }),
  );
}

export async function updateArticle(articleId: string, input: { name: string; reference: string; price: number }) {
  return run(() =>
    mutate((db) => {
      const article = db.articles.find((a) => a.id === articleId);
      if (!article) throw new UserError("Article introuvable.");
      const name = clean(input.name, 120);
      if (!name) throw new UserError("Le nom de l'article est obligatoire.");
      article.name = name;
      article.reference = clean(input.reference, 40);
      article.price = parsePrice(input.price, "Prix");
      return undefined;
    }),
  );
}

/** Entrée (quantité positive) ou correction (quantité négative) de stock. */
export async function adjustStock(articleId: string, delta: number) {
  return run(() =>
    mutate((db) => {
      const article = db.articles.find((a) => a.id === articleId);
      if (!article) throw new UserError("Article introuvable.");
      const change = Math.trunc(Number(delta));
      if (!Number.isFinite(change) || change === 0) throw new UserError("Quantité invalide.");
      if (article.stock + change < 0) throw new UserError(`Stock insuffisant : il reste ${article.stock} en disponible.`);
      article.stock += change;
      if (change > 0) allocate(db);
      return undefined;
    }),
  );
}

/* ───────────────────────── Commandes ───────────────────────── */

/** Recherche les coordonnées d'une adresse. Facultatif : un échec ne doit jamais faire échouer la commande. */
async function locate(orderId: string) {
  try {
    await locateOrder(orderId);
  } catch (error) {
    console.error("[commandes] géolocalisation :", error instanceof Error ? error.message : error);
  }
}

async function locateOrder(orderId: string) {
  const db = await loadDb();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order || order.geo || isPickup(order)) return;
  const geo = await geocode(fullAddress(order));
  if (!geo) return;
  await mutate((fresh) => {
    const target = fresh.orders.find((o) => o.id === orderId);
    if (target) target.geo = geo;
  });
}

export async function createOrder(input: OrderInput) {
  return run(async () => {
    const orderId = await mutate((db) => {
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
      const sequence = (db.counters[`BL-${year}`] ?? 0) + 1;
      db.counters[`BL-${year}`] = sequence;

      const discountType = input.discount?.type === "amount" ? "amount" : "percent";
      const scheduledDate = isDate(input.scheduledDate) ? input.scheduledDate : null;
      const order: Order = {
        id: id(),
        number: `BL-${year}-${String(sequence).padStart(4, "0")}`,
        createdAt: now(),
        shop: input.shop === "paris" ? "paris" : "toulouse",
        observations: clean(input.observations, 500),
        paid: 0,
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
        slot: scheduledDate && (input.slot === "matin" || input.slot === "apres-midi") ? input.slot : "",
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
      log(order, "Bon de commande créé");
      if (order.paid > 0) log(order, order.paid >= total ? "Commande réglée en totalité" : `Acompte de ${order.paid.toFixed(2).replace(".", ",")} € reçu`);
      const missing = lines.filter((l) => !l.reserved);
      if (missing.length) log(order, `En attente de stock : ${missing.map((l) => `${l.quantity} × ${l.name}`).join(", ")}`);
      if (scheduledDate) log(order, `${mode === "retrait" ? "Retrait planifié" : "Livraison programmée"} le ${frDate(scheduledDate)}`);
      db.orders.push(order);
      return order.id;
    });
    await locate(orderId);
    return orderId;
  });
}

export async function scheduleOrder(orderId: string, date: string | null, slot: Slot) {
  return run(async () => {
    await mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status !== "active") throw new UserError("Cette commande est clôturée.");
      if (date !== null && !isDate(date)) throw new UserError("Date invalide.");
      order.scheduledDate = date;
      order.slot = date && (slot === "matin" || slot === "apres-midi") ? slot : "";
      order.reminded = false;
      const what = isPickup(order) ? "Retrait" : "Livraison";
      log(order, date ? `${what} programmé${isPickup(order) ? "" : "e"} le ${frDate(date)}` : `${what} déprogrammé${isPickup(order) ? "" : "e"}`);
    });
    if (date) await locate(orderId);
    return undefined;
  });
}

export async function setPrepared(orderId: string, prepared: boolean) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status !== "active") throw new UserError("Cette commande est clôturée.");
      if (prepared && !isStockComplete(order)) throw new UserError("Impossible : des articles sont encore en attente de stock.");
      order.prepared = prepared;
      order.preparedAt = prepared ? now() : null;
      log(order, prepared ? "Commande préparée par le magasin" : "Préparation annulée");
      return undefined;
    }),
  );
}

/** Enregistre le montant total déjà réglé par le client (acompte ou solde). */
export async function setPaid(orderId: string, amount: number) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status === "cancelled") throw new UserError("Cette commande est annulée.");
      const value = round2(Number(amount));
      if (!Number.isFinite(value) || value < 0) throw new UserError("Montant invalide.");
      const { total } = orderTotals(order);
      if (value > total) throw new UserError(`Le montant dépasse le total de la commande (${total.toFixed(2).replace(".", ",")} €).`);
      order.paid = value;
      log(order, value >= total ? "Commande réglée en totalité" : `Montant réglé : ${value.toFixed(2).replace(".", ",")} €`);
      return undefined;
    }),
  );
}

export async function setReminded(orderId: string, reminded: boolean) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      order.reminded = reminded;
      if (reminded) log(order, "Client prévenu de la date");
      return undefined;
    }),
  );
}

/** Clôture : livrée au client ou retirée sur place. */
export async function completeOrder(orderId: string) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status !== "active") throw new UserError("Cette commande est déjà clôturée.");
      if (!isStockComplete(order)) throw new UserError("Impossible : des articles sont encore en attente de stock.");
      order.status = "done";
      order.doneAt = now();
      log(order, isPickup(order) ? "Commande retirée par le client" : "Commande livrée");
      return undefined;
    }),
  );
}

export async function cancelOrder(orderId: string) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status !== "active") throw new UserError("Cette commande est déjà clôturée.");
      // Les articles réservés retournent en stock, puis servent les autres commandes en attente.
      for (const line of order.lines) {
        if (!line.reserved) continue;
        const article = db.articles.find((a) => a.id === line.articleId);
        if (article) article.stock += line.quantity;
        line.reserved = false;
      }
      order.status = "cancelled";
      order.doneAt = now();
      log(order, "Commande annulée, articles remis en stock");
      allocate(db);
      return undefined;
    }),
  );
}

/** Recherche les coordonnées des livraisons d'une journée et du dépôt (pour la carte du livreur). */
export async function locateDeliveries(date: string) {
  return run(async () => {
    const db = await loadDb();
    const settings = await getSettings();
    const depotAddress = [settings.address, settings.postalCode, settings.city].filter(Boolean).join(", ");
    if (depotAddress && db.depot?.address !== depotAddress) {
      const geo = await geocode(depotAddress);
      if (geo) await mutate((fresh) => void (fresh.depot = { address: depotAddress, ...geo }));
    }
    const missing = db.orders.filter((o) => o.scheduledDate === date && !o.geo && !isPickup(o) && o.status !== "cancelled");
    for (const order of missing.slice(0, 15)) {
      await locate(order.id);
      // Nominatim demande au plus une requête par seconde.
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    return undefined;
  });
}
