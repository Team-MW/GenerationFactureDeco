import type { DeliveryMode, Discount, Order, ShopId, Slot } from "./types";

/** Magasins, tels qu'ils figurent sur le bon de commande. */
export const SHOPS: Record<ShopId, { label: string; address: string }> = {
  toulouse: { label: "DECOSHOP TOULOUSE", address: "3 RUE EMILE BAUDOT, 31100 TOULOUSE" },
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

export function orderTotals(order: Pick<Order, "lines" | "discount" | "delivery">) {
  const subtotal = round2(order.lines.reduce((t, l) => t + l.unitPrice * l.quantity, 0));
  const discount = discountAmount(subtotal, order.discount);
  const delivery = deliveryPrice(order.delivery);
  const total = round2(subtotal - discount + delivery);
  return { subtotal, discount, delivery, total, vat: round2(total - total / 1.2) };
}

/** Montant réglé et reste à payer. */
export function orderBalance(order: Pick<Order, "lines" | "discount" | "delivery" | "paid">) {
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
  return isStockComplete(order) ? "a_programmer" : "attente";
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
