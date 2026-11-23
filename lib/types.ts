export interface Invoice {
  /** Identifiant unique (référence dossier, suffixée en cas de doublon). */
  id: string;
  /** Numéro de facture attribué, stable dans le temps. */
  number: string;
  ref: string;
  /** Date au format AAAA-MM-JJ. */
  date: string;
  /** Mois au format AAAA-MM. */
  month: string;
  client: string;
  /** Montant facturé au client, en euros. */
  amount: number;
  transferred: number;
  commission: number;
  /** Retenue additionnelle appliquée sur la même ligne. */
  retained: number;
  net: number;
  file: string;
}

/** Ligne sans vente (montant d'origine nul) : retenue / remboursement. */
export interface Retention {
  ref: string;
  date: string;
  month: string;
  client: string;
  amount: number;
  file: string;
}

export interface SourceFile {
  name: string;
  size: number;
  mtime: number;
  rows: number;
  invoices: number;
  retentions: number;
  duplicates: number;
  months: string[];
  total: number;
  error?: string;
}

export interface Dataset {
  version: string;
  invoices: Invoice[];
  retentions: Retention[];
  files: SourceFile[];
}

export interface Settings {
  companyName: string;
  legalForm: string;
  capital: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  siret: string;
  rcs: string;
  vatNumber: string;
  email: string;
  phone: string;
  website: string;
  invoicePrefix: string;
  designation: string;
  description: string;
  /** Taux de TVA en %, 0 = franchise en base. */
  vatRate: number;
  /** Les montants des fichiers sont TTC. */
  amountsIncludeVat: boolean;
  /** Les montants des fichiers sont exprimés en centimes. */
  amountsInCents: boolean;
  paymentMethod: string;
  footerNote: string;
  accentColor: string;
}

export interface MonthStat {
  month: string;
  label: string;
  short: string;
  count: number;
  revenue: number;
  commission: number;
  retained: number;
  net: number;
  average: number;
  rate: number;
  cumulative: number;
}

export interface Stats {
  count: number;
  revenue: number;
  commission: number;
  retained: number;
  net: number;
  average: number;
  median: number;
  rate: number;
  clients: number;
  months: MonthStat[];
  best: MonthStat | null;
  last: MonthStat | null;
  previous: MonthStat | null;
  buckets: { label: string; count: number; revenue: number }[];
  weekdays: { label: string; count: number; revenue: number }[];
  top: Invoice[];
  recent: Invoice[];
}
