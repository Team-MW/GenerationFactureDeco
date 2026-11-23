import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { titleCase } from "./format";
import { DATA_DIR, READ_ONLY, ensureDataDir, getSettings } from "./settings";
import { StoreError, USES_SUPABASE, rpc } from "./supabase";
import type { Dataset, Invoice, Retention, Settings, SourceFile } from "./types";

/**
 * Données Lenbox : fichiers d'export importés, transactions et numéros de facture.
 *
 * - Avec Supabase : tout est enregistré en base (tables lenbox_*), donc utilisable en ligne.
 * - Sans Supabase : fichier local data/lenbox.json.
 *
 * Dans les deux cas, les fichiers CSV / Excel présents dans le dossier data/ et pas encore
 * importés le sont automatiquement à la lecture.
 */
export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

interface Transaction {
  /** Anti-doublon : ref|date|montant|retenue. */
  key: string;
  /** Identifiant de facture (référence dossier, suffixée si elle apparaît plusieurs fois). */
  id: string;
  kind: "sale" | "retention";
  ref: string;
  date: string;
  client: string;
  /** Montants tels qu'ils figurent dans le fichier (centimes pour les exports Lenbox). */
  amount: number;
  transferred: number;
  commission: number;
  retained: number;
  file: string;
  number: string | null;
}

interface FileRecord {
  name: string;
  size: number;
  rows: number;
  duplicates: number;
  uploaded_at: string;
}

interface State {
  version: number;
  /** Dernier numéro attribué, par mois. */
  counters: Record<string, number>;
  /**
   * Registre permanent, jamais purgé :
   * - « identifiant de facture » → numéro de facture ;
   * - « k:<clé de la ligne> » → identifiant de facture.
   * Une ligne retirée puis réimportée retrouve ainsi le même identifiant et le même numéro.
   */
  numbers: Record<string, string>;
  /** Fichiers retirés depuis l'interface : ne pas les réimporter depuis le dossier data/. */
  ignored: string[];
  /** Désignation saisie à la main pour une facture : identifiant de facture → texte. */
  designations: Record<string, string>;
  files: FileRecord[];
  transactions: Transaction[];
}

const emptyState = (): State => ({ version: 0, counters: {}, numbers: {}, ignored: [], designations: {}, files: [], transactions: [] });

/* ───────────────────────── Lecture des fichiers ───────────────────────── */

/** Noms de colonnes reconnus (après normalisation). */
const COLUMNS = {
  date: ["transferred_on", "date", "date_virement", "transfer_date", "date_transfert"],
  ref: ["demandereq_ref", "ref", "reference", "dossier", "id"],
  client: ["client", "nom", "name", "customer", "nom_client"],
  amount: ["original_amount", "montant", "amount", "montant_origine"],
  transferred: ["transferred_amount", "montant_transfere", "montant_vire"],
  commission: ["commission_retained", "commission"],
  retained: ["additional_amount_retained", "retenue", "montant_retenu"],
} as const;

type Field = keyof typeof COLUMNS;

interface RawRow {
  date: string;
  ref: string;
  client: string;
  amount: number;
  transferred: number;
  commission: number;
  retained: number;
  file: string;
}

const normalizeHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  const cleaned = String(value).replace(/[\s  €]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value === "number" && value > 20000 && value < 80000) {
    // Numéro de série Excel
    const d = new Date(Math.round((value - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(value ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return null;
}

/** « Transactions (3).xlsx » → 3 ; « Transactions.xlsx » → 0 (0 = janvier). */
function monthIndexFromName(name: string): number | null {
  const m = name.match(/\((\d{1,2})\)/) ?? name.match(/(\d{1,2})(?=\.[a-z]+$)/i);
  const index = m ? Number(m[1]) : 0;
  return index >= 0 && index <= 11 ? index : null;
}

/** Lit un fichier CSV ou Excel et renvoie ses lignes, montants non convertis. */
function parseFile(name: string, buffer: Buffer): { rows: RawRow[]; total: number } {
  const workbook = name.toLowerCase().endsWith(".csv")
    ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, ""), { type: "string", raw: true })
    : XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new StoreError("Fichier vide");
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  if (records.length === 0) return { rows: [], total: 0 };

  const keys = new Map<Field, string>();
  for (const header of Object.keys(records[0])) {
    const normalized = normalizeHeader(header);
    for (const field of Object.keys(COLUMNS) as Field[]) {
      if (!keys.has(field) && (COLUMNS[field] as readonly string[]).includes(normalized)) keys.set(field, header);
    }
  }
  if (!keys.has("client") || !keys.has("amount")) {
    throw new StoreError("Colonnes « client » et « original_amount » introuvables");
  }

  const fallbackMonth = monthIndexFromName(name);
  const year = new Date().getFullYear();
  const get = (record: Record<string, unknown>, field: Field) => (keys.has(field) ? record[keys.get(field)!] : "");

  const rows: RawRow[] = [];
  records.forEach((record, index) => {
    const client = String(get(record, "client") ?? "").trim();
    if (!client) return;
    const amount = toNumber(get(record, "amount"));
    const date = toDate(get(record, "date")) ?? (fallbackMonth != null ? `${year}-${pad(fallbackMonth + 1)}-01` : null);
    if (!date) return;
    rows.push({
      date,
      ref: String(get(record, "ref") ?? "").trim() || `${name}-${index + 1}`,
      client: titleCase(client),
      amount,
      transferred: keys.has("transferred") ? toNumber(get(record, "transferred")) : amount,
      commission: toNumber(get(record, "commission")),
      retained: toNumber(get(record, "retained")),
      file: name,
    });
  });
  return { rows, total: records.length };
}

const STATE_FILE = path.join(DATA_DIR, "lenbox.json");

/* ───────────────────────── Import dans l'état ───────────────────────── */

interface Incoming {
  name: string;
  size: number;
  buffer: Buffer;
}

interface ImportReport {
  name: string;
  invoices: number;
  retentions: number;
  duplicates: number;
  error?: string;
}

const rowKey = (r: RawRow) => [r.ref, r.date, r.amount, r.retained].join("|");

/**
 * Ajoute des fichiers à l'état : dédoublonne, attribue les identifiants et les numéros de facture.
 * Les lignes de tous les fichiers sont numérotées ensemble, par date puis référence.
 */
function importFiles(state: State, incoming: Incoming[], prefix: string): ImportReport[] {
  const known = new Set(state.transactions.map((t) => t.key));
  // Identifiants déjà pris : par une facture présente, ou réservés à une autre ligne dans le registre.
  const takenIds = new Set(state.transactions.filter((t) => t.kind === "sale").map((t) => t.id));
  const reservedIds = new Map<string, string>();
  for (const [entry, id] of Object.entries(state.numbers)) if (entry.startsWith("k:")) reservedIds.set(id, entry.slice(2));

  const reports = new Map<string, ImportReport>();
  const fresh: RawRow[] = [];
  for (const file of incoming) {
    const report: ImportReport = { name: file.name, invoices: 0, retentions: 0, duplicates: 0 };
    reports.set(file.name, report);
    let total = 0;
    try {
      const parsed = parseFile(file.name, file.buffer);
      total = parsed.total;
      for (const row of parsed.rows) {
        const key = rowKey(row);
        if (known.has(key)) {
          report.duplicates += 1;
        } else if (row.amount > 0 || row.retained > 0) {
          known.add(key);
          fresh.push(row);
        }
      }
    } catch (error) {
      report.error = error instanceof Error ? error.message : "Fichier illisible";
    }
    state.files = state.files.filter((f) => f.name !== file.name);
    state.files.push({ name: file.name, size: file.size, rows: total, duplicates: report.duplicates, uploaded_at: new Date().toISOString() });
    state.ignored = state.ignored.filter((n) => n !== file.name);
  }

  fresh.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
  for (const row of fresh) {
    const report = reports.get(row.file)!;
    const key = rowKey(row);
    if (row.amount > 0) {
      let id = state.numbers[`k:${key}`];
      if (!id || takenIds.has(id)) {
        // Première fois que cette ligne est vue : référence dossier, suffixée si elle est déjà utilisée.
        const base = row.ref.replace(/[^A-Za-z0-9_-]/g, "_");
        for (let n = 1; ; n++) {
          id = n === 1 ? base : `${base}-${n}`;
          const owner = reservedIds.get(id);
          if (!takenIds.has(id) && (owner === undefined || owner === key)) break;
        }
        state.numbers[`k:${key}`] = id;
        reservedIds.set(id, key);
      }
      takenIds.add(id);
      const month = row.date.slice(0, 7);
      let number = state.numbers[id];
      if (!number) {
        const next = (state.counters[month] ?? 0) + 1;
        state.counters[month] = next;
        number = `${prefix}-${month}-${String(next).padStart(3, "0")}`;
        state.numbers[id] = number;
      }
      state.transactions.push({ key, id, kind: "sale", ref: row.ref, date: row.date, client: row.client, amount: row.amount, transferred: row.transferred, commission: row.commission, retained: row.retained, file: row.file, number });
      report.invoices += 1;
    } else {
      state.transactions.push({ key, id: `retenue:${key}`, kind: "retention", ref: row.ref, date: row.date, client: row.client, amount: 0, transferred: row.transferred, commission: row.commission, retained: row.retained, file: row.file, number: null });
      report.retentions += 1;
    }
  }
  return [...reports.values()];
}

/**
 * Premier remplissage du registre, pour conserver les numéros déjà attribués :
 * d'abord depuis l'état local (data/lenbox.json, cas du passage à la base de données),
 * sinon depuis le registre de la toute première version (data/.registre.json).
 */
function seedRegistry(state: State) {
  if (Object.keys(state.numbers).length > 0) return;
  try {
    const local = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (local.numbers && Object.keys(local.numbers).length > 0) {
      state.numbers = { ...local.numbers };
      state.counters = { ...(local.counters ?? {}) };
      state.designations = { ...(local.designations ?? {}) };
      return;
    }
  } catch {
    // pas d'état local
  }
  try {
    const legacy = JSON.parse(fs.readFileSync(path.join(DATA_DIR, ".registre.json"), "utf8"));
    state.numbers = { ...(legacy.numbers ?? {}) };
    state.counters = { ...(legacy.counters ?? {}) };
  } catch {
    // pas d'ancien registre
  }
}

/* ───────────────────────── Stockage de l'état ───────────────────────── */

const globals = globalThis as unknown as {
  __lenboxQueue?: Promise<unknown>;
  __lenboxMemory?: State;
  __lenboxCache?: { at: number; state: State };
  __lenboxDisk?: string;
  __lenboxDataset?: { key: string; dataset: Dataset };
};

async function loadRemote(): Promise<State> {
  const raw = await rpc<Partial<State> | null>("lenbox_load");
  return {
    ...emptyState(),
    ...(raw ?? {}),
    version: Number(raw?.version ?? 0),
    designations: raw?.designations ?? {},
    transactions: (raw?.transactions ?? []).map((t) => ({
      ...t,
      amount: Number(t.amount),
      transferred: Number(t.transferred),
      commission: Number(t.commission),
      retained: Number(t.retained),
    })),
  };
}

function loadLocal(): State {
  // Disque en lecture seule et pas de base : l'état ne vit qu'en mémoire, reconstruit à chaque démarrage.
  if (READ_ONLY) return globals.__lenboxMemory ?? emptyState();
  let text: string;
  try {
    text = fs.readFileSync(STATE_FILE, "utf8");
  } catch {
    return emptyState(); // premier lancement : pas encore de fichier
  }
  try {
    return { ...emptyState(), ...JSON.parse(text) };
  } catch {
    // Fichier abîmé : on s'arrête plutôt que de repartir de zéro et d'écraser les numéros de facture.
    throw new StoreError("Le fichier data/lenbox.json est illisible. Restaurez-le depuis une sauvegarde avant de continuer.");
  }
}

async function loadState(): Promise<State> {
  if (!USES_SUPABASE) return loadLocal();
  const cached = globals.__lenboxCache;
  if (cached && Date.now() - cached.at < 3000) return cached.state;
  const state = await loadRemote();
  globals.__lenboxCache = { at: Date.now(), state };
  return state;
}

/** Applique une modification à l'état et l'enregistre. Recommence si un autre enregistrement est passé entre-temps. */
function mutateState<T>(change: (state: State) => T): Promise<{ state: State; result: T }> {
  const run = async () => {
    if (!USES_SUPABASE) {
      const state = structuredClone(loadLocal());
      const result = change(state);
      state.version += 1;
      if (READ_ONLY) {
        globals.__lenboxMemory = state;
      } else {
        ensureDataDir();
        fs.writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(state, null, 2));
        fs.renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
      }
      return { state, result };
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const state = await loadRemote();
      const filesBefore = new Map(state.files.map((f) => [f.name, JSON.stringify(f)]));
      const keysBefore = new Set(state.transactions.map((t) => t.key));
      const result = change(state);
      const names = new Set(state.files.map((f) => f.name));
      const saved = await rpc<boolean>("lenbox_save", {
        p_version: state.version,
        p_files: state.files.filter((f) => filesBefore.get(f.name) !== JSON.stringify(f)),
        p_transactions: state.transactions.filter((t) => !keysBefore.has(t.key)),
        p_removed: [...filesBefore.keys()].filter((name) => !names.has(name)),
        p_counters: state.counters,
        p_numbers: state.numbers,
        p_ignored: state.ignored,
        p_designations: state.designations,
      });
      if (saved === true) {
        state.version += 1;
        globals.__lenboxCache = { at: Date.now(), state };
        return { state, result };
      }
      await new Promise((resolve) => setTimeout(resolve, 40 + Math.random() * 120));
    }
    throw new StoreError("Trop de modifications en même temps. Réessayez.");
  };
  const next = (globals.__lenboxQueue ?? Promise.resolve()).then(run, run);
  globals.__lenboxQueue = next.catch(() => undefined);
  return next;
}

/* ───────────────────────── Dossier data/ ───────────────────────── */

function diskFiles(): { name: string; size: number; mtime: number }[] {
  try {
    return fs
      .readdirSync(DATA_DIR)
      .filter((name) => !name.startsWith(".") && !name.startsWith("~$") && ACCEPTED_EXTENSIONS.includes(path.extname(name).toLowerCase()))
      .map((name) => {
        const stat = fs.statSync(path.join(DATA_DIR, name));
        return { name, size: stat.size, mtime: stat.mtimeMs };
      })
      .filter((f) => f.size > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
  } catch {
    return [];
  }
}

const diskSignature = () => diskFiles().map((f) => `${f.name}:${f.size}:${f.mtime}`).join("|");

/** Importe les fichiers déposés dans data/ qui ne sont pas encore connus. */
async function syncDisk(state: State, settings: Settings): Promise<State> {
  const known = new Set([...state.files.map((f) => f.name), ...state.ignored]);
  const pending = diskFiles().filter((f) => !known.has(f.name));
  if (pending.length === 0) return state;
  const incoming: Incoming[] = pending.map((f) => ({ name: f.name, size: f.size, buffer: fs.readFileSync(path.join(DATA_DIR, f.name)) }));
  const { state: next } = await mutateState((s) => {
    seedRegistry(s);
    const already = new Set([...s.files.map((f) => f.name), ...s.ignored]);
    importFiles(s, incoming.filter((f) => !already.has(f.name)), settings.invoicePrefix);
  });
  return next;
}

/* ───────────────────────── Interface publique ───────────────────────── */

const round2 = (n: number) => Math.round(n * 100) / 100;

function buildDataset(state: State, settings: Settings): Dataset {
  const divisor = settings.amountsInCents ? 100 : 1;
  const invoices: Invoice[] = [];
  const retentions: Retention[] = [];
  const perFile = new Map<string, { invoices: number; retentions: number; total: number; months: Set<string> }>();
  const statOf = (file: string) => {
    let stat = perFile.get(file);
    if (!stat) perFile.set(file, (stat = { invoices: 0, retentions: 0, total: 0, months: new Set() }));
    return stat;
  };

  for (const t of state.transactions) {
    const stat = statOf(t.file);
    const month = t.date.slice(0, 7);
    stat.months.add(month);
    if (t.kind === "sale") {
      const amount = t.amount / divisor;
      const transferred = t.transferred / divisor;
      const commission = t.commission / divisor;
      const retained = t.retained / divisor;
      invoices.push({ id: t.id, number: t.number ?? "", ref: t.ref, date: t.date, month, client: t.client, amount, transferred, commission, retained, net: round2(transferred - commission - retained), file: t.file, designation: state.designations[t.id] ?? "" });
      stat.invoices += 1;
      stat.total = round2(stat.total + amount);
    } else {
      retentions.push({ ref: t.ref, date: t.date, month, client: t.client, amount: t.retained / divisor, file: t.file });
      stat.retentions += 1;
    }
  }
  invoices.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
  retentions.sort((a, b) => a.date.localeCompare(b.date));

  const files: SourceFile[] = state.files
    .map((f) => {
      const stat = perFile.get(f.name);
      return {
        name: f.name,
        size: f.size,
        mtime: Date.parse(f.uploaded_at) || 0,
        rows: f.rows,
        invoices: stat?.invoices ?? 0,
        retentions: stat?.retentions ?? 0,
        duplicates: f.duplicates,
        months: [...(stat?.months ?? [])].sort(),
        total: stat?.total ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));

  return { version: `${state.version}:${divisor}`, invoices, retentions, files };
}

/** Toutes les factures, retenues et fichiers importés. */
export async function getDataset(): Promise<Dataset> {
  const settings = await getSettings();
  const state = await syncDisk(await loadState(), settings);
  const key = `${state.version}:${settings.amountsInCents}`;
  if (globals.__lenboxDataset?.key === key) return globals.__lenboxDataset.dataset;
  const dataset = buildDataset(state, settings);
  globals.__lenboxDataset = { key, dataset };
  return dataset;
}

export async function findInvoice(id: string): Promise<Invoice | undefined> {
  return (await getDataset()).invoices.find((invoice) => invoice.id === id);
}

/** Version courante des données : change à chaque import ou retrait de fichier. Peu coûteux à appeler. */
export async function getVersion(): Promise<string> {
  if (!USES_SUPABASE) return (await getDataset()).version;
  const signature = diskSignature();
  if (signature !== globals.__lenboxDisk) {
    await getDataset();
    globals.__lenboxDisk = signature;
  }
  return String(await rpc<number>("lenbox_version"));
}

export interface UploadResult {
  name: string;
  status: "imported" | "duplicate" | "error";
  invoices: number;
  message?: string;
}

/** Importe un fichier envoyé depuis l'interface. */
export async function importUpload(originalName: string, buffer: Buffer): Promise<UploadResult> {
  const settings = await getSettings();
  const base = path.basename(originalName).replace(/[\\/:*?"<>|]/g, "_");
  const ext = path.extname(base);
  const { result } = await mutateState((state): UploadResult => {
    seedRegistry(state);
    // Fichier sans aucune ligne nouvelle : rien à faire.
    const probe = importFiles(structuredClone(state), [{ name: base, size: buffer.length, buffer }], settings.invoicePrefix)[0];
    if (probe.error) return { name: base, status: "error", invoices: 0, message: probe.error };
    if (probe.invoices + probe.retentions === 0) return { name: base, status: "duplicate", invoices: 0 };
    // On ne remplace jamais un fichier existant : même nom, contenu nouveau → nom suffixé.
    let name = base;
    for (let i = 2; state.files.some((f) => f.name === name); i++) name = `${path.basename(base, ext)} - copie ${i}${ext}`;
    const report = importFiles(state, [{ name, size: buffer.length, buffer }], settings.invoicePrefix)[0];
    return { name, status: "imported", invoices: report.invoices };
  });
  if (result.status === "imported" && !READ_ONLY) {
    // Copie du fichier d'origine dans data/, pour archive.
    try {
      ensureDataDir();
      const target = path.join(DATA_DIR, result.name);
      if (!fs.existsSync(/* turbopackIgnore: true */ target)) fs.writeFileSync(target, buffer);
    } catch {
      // l'archive est un confort, pas une nécessité
    }
  }
  return result;
}

/** Enregistre la désignation propre à une facture (texte vide = retour à la désignation générale). */
export async function setDesignation(id: string, designation: string): Promise<boolean> {
  const text = designation.trim().slice(0, 200);
  const { result } = await mutateState((state) => {
    if (!state.transactions.some((t) => t.kind === "sale" && t.id === id)) return false;
    if (text) state.designations[id] = text;
    else delete state.designations[id];
    return true;
  });
  return result;
}

/** Retire un fichier et ses factures. Les numéros déjà attribués restent réservés. */
export async function removeFile(name: string): Promise<boolean> {
  const { result } = await mutateState((state) => {
    if (!state.files.some((f) => f.name === name)) return false;
    state.files = state.files.filter((f) => f.name !== name);
    state.transactions = state.transactions.filter((t) => t.file !== name);
    if (!state.ignored.includes(name)) state.ignored.push(name);
    return true;
  });
  return result;
}
