export type DeliveryMode = "retrait" | "porte" | "etage" | "montage";
export type Slot = "" | "matin" | "apres-midi";
export type ShopId = "toulouse" | "paris";
export type OrderStatus = "active" | "done" | "cancelled";

export interface Article {
  id: string;
  name: string;
  reference: string;
  /** Famille de produits (« Canapés », « Tables basses »…), vide si non classé. */
  category: string;
  /** Dimensions ou configuration (« 300 × 200 cm », « Angle gauche »…). */
  dimensions: string;
  color: string;
  /** Prix de vente TTC, en euros. 0 = prix pas encore défini. */
  price: number;
  /** Prix d'achat chez le fournisseur, facultatif. 0 = non renseigné. */
  cost: number;
  /** Frais de transport par pièce saisis à la main (utilisés quand aucun camion n'est renseigné), facultatif. */
  transport: number;
  /** Coût total du camion (ou conteneur) qui a livré l'article, et nombre total d'articles qu'il transportait. */
  truckCost: number;
  truckUnits: number;
  /** Transport (camion, conteneur) auquel l'article est rattaché, et nombre de pièces de ce produit qu'il contenait. */
  truckId: string;
  truckQty: number;
  /** Droits de douane, en % du prix d'achat + transport. */
  customsRate: number;
  /** Frais de douane en euros par pièce (s'ajoutent au pourcentage). Jamais soumis à la TVA. */
  customsFixed: number;
  /** Autres frais par pièce (manutention, emballage, assurance…). */
  fees: number;
  /** Valeur propre à ce produit pour un poste de coût du magasin (identifiant du poste → valeur). */
  extras: Record<string, number>;
  /** Fournisseur, facultatif. */
  supplier: string;
  /** Quantité disponible (non réservée par une commande). */
  stock: number;
  createdAt: string;
}

/** Fiche d'un article telle qu'on la saisit (inventaire ou bon de commande). */
export interface ArticleInput {
  name: string;
  reference: string;
  price: number;
  /** Prix d'achat, frais de transport par pièce et fournisseur : facultatifs. */
  cost?: number;
  transport?: number;
  truckCost?: number;
  truckUnits?: number;
  truckId?: string;
  truckQty?: number;
  customsRate?: number;
  customsFixed?: number;
  fees?: number;
  extras?: Record<string, number>;
  supplier?: string;
  category?: string;
  dimensions?: string;
  color?: string;
}

export interface OrderLine {
  id: string;
  articleId: string;
  name: string;
  reference: string;
  unitPrice: number;
  /** Coût de revient HT de l'article (achat + transport + douane + frais) le jour de la commande ; 0 ou absent = inconnu. */
  unitCost?: number;
  /** Frais de vente du jour de la commande, en proportion du prix HT (postes en % du prix de vente : commission, carte…). */
  salesRate?: number;
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

export type PaymentMethod = "especes" | "carte" | "virement" | "";

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

/** Signature électronique du bon de commande par le client. */
export interface Signature {
  at: string;
  /** Tracé de la signature : chemin SVG dans un cadre de 600 × 200. */
  path: string;
  /** Adresse IP depuis laquelle le bon a été signé (élément de preuve). */
  ip: string;
  /** La commande telle que le client l'a signée : le bon signé est toujours imprimé à partir de cette copie. */
  snapshot: SignedOrder;
}

export interface Order {
  id: string;
  /** Numéro du bon de commande, ex. BL-2026-0001. */
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
  /** E-mails envoyés au client pour cette commande. */
  emails: { at: string; kind: string; to: string }[];
  history: { at: string; text: string }[];
  /** Jeton secret du lien de signature envoyé au client (vide = pas encore de lien). */
  signToken: string;
  signature: Signature | null;
}

/** Ce qui est figé au moment de la signature. */
export type SignedOrder = Omit<Order, "history" | "emails" | "signature" | "signToken" | "geo" | "geoFailed">;

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

/** Données envoyées par le formulaire de création d'un bon de commande. */
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
    newArticle?: ArticleInput & { stock: number };
    /** Prix saisi sur le bon pour un article de l'inventaire qui n'en a pas encore : il est enregistré sur l'article. */
    price?: number;
    quantity: number;
  }[];
  discount: Discount;
  delivery: { mode: DeliveryMode; adjustment: number; offered: boolean };
  scheduledDate: string | null;
  slot: Slot;
  /** Heure prévue (HH:MM), facultative. */
  time?: string;
  /** Envoyer le bon de commande par e-mail au client dès la création. */
  sendEmail?: boolean;
}

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
