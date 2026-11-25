import type { DeliveryMode, Discount, Order, PaymentMethod, ShopId, SignedOrder, Slot } from "./types";

export const PAYMENT_METHODS: Record<Exclude<PaymentMethod, "">, string> = { especes: "Espèces", carte: "Carte bancaire", virement: "Virement" };

/** « espèces, carte bancaire ou virement » : la liste écrite en toutes lettres. */
export const PAYMENT_SENTENCE = Object.values(PAYMENT_METHODS)
  .map((label) => label.toLowerCase())
  .join(", ")
  .replace(/, ([^,]*)$/, " ou $1");

/** Magasins, tels qu'ils figurent sur le bon de commande. */
export const SHOPS: Record<ShopId, { label: string; address: string }> = {
  toulouse: { label: "DECOSHOP TOULOUSE", address: "3 RUE EMILE BAUDOT, 31100 TOULOUSE" },
  // Magasin fermé : conservé uniquement pour l'affichage des anciennes commandes.
  paris: { label: "DECOSHOP PARIS", address: "RUE JEAN PIERRE TIMBAUD 78520 LIMAY" },
};

/** Formules de livraison et leur tarif de base (TTC). */
export const DELIVERY_MODES: Record<DeliveryMode, { label: string; short: string; price: number; hint: string }> = {
  retrait: { label: "Retrait sur place", short: "Retrait", price: 0, hint: "Le client vient chercher sa commande" },
  porte: { label: "Livraison au pied de la porte", short: "Pied de porte", price: 50, hint: "Dépose devant l'entrée" },
  etage: { label: "Livraison à l'étage", short: "À l'étage", price: 100, hint: "Montée dans la pièce souhaitée" },
  montage: { label: "Livraison + montage", short: "Montage", price: 150, hint: "Montée et montage des meubles" },
};

export const SLOT_LABEL: Record<Slot, string> = { "": "Journée", matin: "Matin", "apres-midi": "Après-midi" };

/** « 14:30 » → « 14h30 », « 09:00 » → « 9h ». */
export function hourLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h}h${m ? String(m).padStart(2, "0") : ""}`;
}

/** Moment prévu d'une commande : l'heure si elle est fixée, sinon la demi-journée. */
export function timeLabel(order: Pick<Order, "slot" | "time">): string {
  return order.time ? hourLabel(order.time) : SLOT_LABEL[order.slot];
}

/** Heure normalisée « HH:MM » (entre 00:00 et 23:59), ou chaîne vide si invalide. */
export function cleanTime(value: unknown): string {
  const m = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = Number(m[1]), min = Number(m[2]);
  return h <= 23 && min <= 59 ? `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` : "";
}

/** Demi-journée correspondant à une heure. */
export const slotOfTime = (time: string): Slot => (time < "12:30" ? "matin" : "apres-midi");

/** Ordre de passage dans une journée : heure fixée d'abord, puis matin, journée, après-midi. */
export function sortKey(order: Pick<Order, "slot" | "time">): string {
  return order.time || { matin: "08:00", "": "12:29", "apres-midi": "13:00" }[order.slot];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function discountAmount(subtotal: number, discount: Discount): number {
  const value = Math.max(0, discount.value || 0);
  if (value === 0) return 0;
  const amount = discount.type === "percent" ? (subtotal * Math.min(value, 100)) / 100 : value;
  return round2(Math.min(amount, subtotal));
}

export function deliveryPrice(delivery: Order["delivery"]): number {
  if (delivery.offered) return 0;
  return round2(Math.max(0, delivery.basePrice + delivery.adjustment));
}

export function orderTotals(order: Pick<Order, "lines" | "discount" | "delivery"> & { extras?: { amount: number }[] }) {
  const subtotal = round2(order.lines.reduce((t, l) => t + l.unitPrice * l.quantity, 0));
  const discount = discountAmount(subtotal, order.discount);
  const delivery = deliveryPrice(order.delivery);
  const extras = round2((order.extras ?? []).reduce((t, e) => t + e.amount, 0));
  const total = round2(subtotal - discount + delivery + extras);
  return { subtotal, discount, delivery, extras, total, vat: round2(total - total / 1.2) };
}

/** « Toulouse », « Paris » : nom court du magasin qui a pris la commande. */
export function shopName(shop: ShopId): string {
  const city = SHOPS[shop].label.replace(/^\S+\s+/, "");
  return city.charAt(0) + city.slice(1).toLowerCase();
}

/** Montant réglé et reste à payer. */
export function orderBalance(order: Pick<Order, "lines" | "discount" | "delivery" | "paid"> & { extras?: { amount: number }[] }) {
  const { total } = orderTotals(order);
  const paid = round2(Math.min(Math.max(0, order.paid || 0), total));
  return { total, paid, rest: round2(total - paid), settled: paid >= total };
}

export const isStockComplete = (order: Pick<Order, "lines">) => order.lines.every((l) => l.reserved);
export const isPickup = (order: Pick<Order, "delivery">) => order.delivery.mode === "retrait";

export type Stage = "annulee" | "terminee" | "attente" | "a_programmer" | "programmee";

/** Étape d'une commande, dans l'ordre où elle avance. */
export function orderStage(order: Order): Stage {
  if (order.status === "cancelled") return "annulee";
  if (order.status === "done") return "terminee";
  if (order.scheduledDate) return "programmee";
  // Le stock est indicatif (voir le badge de stock) : une commande sans date est toujours « à programmer ».
  return "a_programmer";
}

export function stageLabel(order: Order): string {
  const pickup = isPickup(order);
  switch (orderStage(order)) {
    case "annulee":
      return "Annulée";
    case "terminee":
      return pickup ? "Retirée" : "Livrée";
    case "attente":
      return "En attente de stock";
    case "a_programmer":
      return pickup ? "Retrait à planifier" : "Livraison à programmer";
    case "programmee":
      return pickup ? "Retrait planifié" : "Livraison programmée";
  }
}

export const STAGE_STYLE: Record<Stage, string> = {
  annulee: "bg-slate-100 text-slate-600",
  terminee: "bg-emerald-50 text-emerald-700",
  attente: "bg-amber-50 text-amber-800",
  a_programmer: "bg-violet-50 text-violet-700",
  programmee: "bg-sky-50 text-sky-700",
};

/** Date du jour à Paris, au format AAAA-MM-JJ. */
export function parisToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

/** Date (AAAA-MM-JJ) d'un horodatage, à l'heure de Paris. */
export function parisDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(iso));
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 2026-11-24 » → « mardi 24 novembre » (ou Aujourd'hui / Demain). */
export function dayLabel(date: string, today = parisToday()): string {
  const d = new Date(`${date}T12:00:00Z`);
  const text = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (date === today) return `Aujourd'hui · ${text}`;
  if (date === addDays(today, 1)) return `Demain · ${text}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function fullAddress(order: Pick<Order, "customer">): string {
  const c = order.customer;
  return [c.address, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/* ───────────────────────── Signature du bon ───────────────────────── */

/** Copie de la commande à figer au moment où le client signe. */
export function snapshotOf(order: Order): SignedOrder {
  const { history: _h, emails: _e, signature: _s, signToken: _t, geo: _g, geoFailed: _f, ...rest } = order;
  return structuredClone(rest);
}

const signedParts = (o: Pick<Order, "lines" | "discount" | "delivery" | "extras">) =>
  JSON.stringify([o.lines.map((l) => [l.name, l.reference, l.unitPrice, l.quantity]), o.discount, o.delivery, o.extras.map((e) => [e.label, e.amount])]);

/** La commande est-elle toujours celle que le client a signée (mêmes articles, mêmes prix) ? */
export function signatureMatches(order: Order): boolean {
  return Boolean(order.signature) && signedParts(order) === signedParts(order.signature!.snapshot);
}

/** Le bon tel qu'il a été signé, même si la commande a changé depuis. */
export function signedCopy(order: Order): Order {
  return order.signature ? { ...order, ...structuredClone(order.signature.snapshot) } : order;
}

/* ───────────────────────── Articles ───────────────────────── */

/** « 300 × 200 cm · Noyer » : ce qui distingue deux articles du même nom. */
export const articleDetails = (article: { dimensions?: string; color?: string }) => [article.dimensions, article.color].filter(Boolean).join(" · ");

/** Désignation complète, telle qu'elle s'imprime sur le bon de commande. */
export const articleLabel = (article: { name: string; dimensions?: string; color?: string }) => [article.name, articleDetails(article)].filter(Boolean).join(" · ");
