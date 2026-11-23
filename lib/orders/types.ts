export type DeliveryMode = "retrait" | "porte" | "etage" | "montage";
export type Slot = "" | "matin" | "apres-midi";
export type ShopId = "toulouse" | "paris";
export type OrderStatus = "active" | "done" | "cancelled";

export interface Article {
  id: string;
  name: string;
  reference: string;
  /** Prix de vente TTC, en euros. */
  price: number;
  /** Quantité disponible (non réservée par une commande). */
  stock: number;
  createdAt: string;
}

export interface OrderLine {
  id: string;
  articleId: string;
  name: string;
  reference: string;
  unitPrice: number;
  quantity: number;
  /** true = la quantité est sortie du stock et mise de côté pour cette commande. */
  reserved: boolean;
}

/** Prestation ajoutée après coup (ex. par le livreur sur place) et qui s'ajoute au total. */
export interface Extra {
  id: string;
  label: string;
  amount: number;
  at: string;
}

export type PaymentMethod = "especes" | "carte" | "cheque" | "virement" | "";

/** Un encaissement : acompte au magasin, ou règlement reçu par le livreur. */
export interface Payment {
  at: string;
  amount: number;
  method: PaymentMethod;
  by: "magasin" | "livreur";
}

export interface Discount {
  type: "percent" | "amount";
  value: number;
}

export interface Delivery {
  mode: DeliveryMode;
  /** Tarif de base de la formule au moment de la commande. */
  basePrice: number;
  /** Supplément (positif, ex. distance) ou remise (négatif) sur la livraison. */
  adjustment: number;
  offered: boolean;
}

export interface Customer {
  name: string;
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  notes: string;
}

export interface Order {
  id: string;
  /** Numéro du bon de livraison, ex. BL-2026-0001. */
  number: string;
  createdAt: string;
  /** Magasin qui a pris la commande. */
  shop: ShopId;
  customer: Customer;
  lines: OrderLine[];
  discount: Discount;
  delivery: Delivery;
  /** Texte libre « Observations et délais » imprimé sur le bon de commande. */
  observations: string;
  /** Montant déjà réglé par le client (acompte ou totalité), en euros. */
  paid: number;
  /** Détail des encaissements (leur somme vaut `paid`). */
  payments: Payment[];
  /** Prestations ajoutées après la commande. */
  extras: Extra[];
  /** Date de livraison ou de retrait (AAAA-MM-JJ), null = à programmer. */
  scheduledDate: string | null;
  slot: Slot;
  /** Heure prévue (HH:MM), vide si seule la demi-journée est connue. */
  time: string;
  prepared: boolean;
  preparedAt: string | null;
  /** Le client a été prévenu de la livraison (rappel). */
  reminded: boolean;
  status: OrderStatus;
  doneAt: string | null;
  geo: { lat: number; lon: number } | null;
  /** L'adresse n'a pas pu être placée sur la carte : inutile de réessayer à chaque ouverture. */
  geoFailed?: boolean;
  history: { at: string; text: string }[];
}

export interface Depot {
  address: string;
  lat: number;
  lon: number;
}

export interface Db {
  articles: Article[];
  orders: Order[];
  counters: Record<string, number>;
  depot: Depot | null;
}

/** Données envoyées par le formulaire de création d'un bon de livraison. */
export interface OrderInput {
  shop: ShopId;
  observations: string;
  /** Acompte versé à la commande. */
  paid: number;
  customer: Customer;
  lines: {
    /** Article existant… */
    articleId?: string;
    /** …ou article à créer. */
    newArticle?: { name: string; reference: string; price: number; stock: number };
    quantity: number;
  }[];
  discount: Discount;
  delivery: { mode: DeliveryMode; adjustment: number; offered: boolean };
  scheduledDate: string | null;
  slot: Slot;
  /** Heure prévue (HH:MM), facultative. */
  time?: string;
}

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
