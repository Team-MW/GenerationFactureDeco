/** Service après-vente : une demande d'un client, puis un rendez-vous chez lui. */
export type SavStatus = "nouvelle" | "planifiee" | "terminee" | "annulee";
export type SavKind = "reparation" | "piece" | "echange" | "retour" | "autre";

export const SAV_KINDS: Record<SavKind, string> = {
  reparation: "Réparation",
  piece: "Pièce manquante ou abîmée",
  echange: "Échange",
  retour: "Retour",
  autre: "Autre",
};

export const SAV_STATUS: Record<SavStatus, { label: string; style: string }> = {
  nouvelle: { label: "Rendez-vous à fixer", style: "bg-amber-50 text-amber-800" },
  planifiee: { label: "Rendez-vous fixé", style: "bg-sky-100 text-sky-800" },
  terminee: { label: "Terminée", style: "bg-emerald-50 text-emerald-700" },
  annulee: { label: "Annulée", style: "bg-slate-100 text-slate-600" },
};

export interface SavCustomer {
  name: string;
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
}

export interface SavTicket {
  id: string;
  /** Numéro de la demande, ex. SAV-0001. */
  number: string;
  createdAt: string;
  customer: SavCustomer;
  /** Numéro du bon de commande concerné, vide si inconnu. */
  orderNumber: string;
  /** Produit concerné. */
  product: string;
  kind: SavKind;
  /** Ce que le client signale. */
  problem: string;
  status: SavStatus;
  /** Rendez-vous chez le client : date (AAAA-MM-JJ), moment ("" = journée, "matin", "apres-midi" ou « HH:MM »), intervenant, consigne. */
  visitDate: string | null;
  visitMoment: string;
  technician: string;
  visitNote: string;
  /** Compte rendu saisi à la clôture. */
  report: string;
  doneAt: string | null;
  history: { at: string; text: string }[];
}

export interface SavDb {
  tickets: SavTicket[];
  counter: number;
}

/** Ce que le formulaire envoie pour créer ou modifier une demande. */
export interface SavInput {
  id?: string;
  customer: SavCustomer;
  orderNumber: string;
  product: string;
  kind: SavKind;
  problem: string;
}

export const savAddress = (customer: SavCustomer) => [customer.address, [customer.postalCode, customer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
