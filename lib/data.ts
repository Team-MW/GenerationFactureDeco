import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { titleCase } from "./format";
import { DATA_DIR, ensureDataDir, getSettings, settingsMtime } from "./settings";
import type { Dataset, Invoice, Retention, SourceFile } from "./types";

const REGISTRY_FILE = path.join(DATA_DIR, ".registre.json");
export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

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

interface Registry {
  numbers: Record<string, string>;
  counters: Record<string, number>;
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

function readWorkbook(filePath: string): XLSX.WorkBook {
  const buffer = fs.readFileSync(filePath);
  if (filePath.toLowerCase().endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, "");
    return XLSX.read(text, { type: "string", raw: true });
  }
  return XLSX.read(buffer, { type: "buffer", cellDates: true });
}

function parseFile(name: string, divisor: number): { rows: RawRow[]; total: number } {
  const workbook = readWorkbook(path.join(DATA_DIR, name));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Fichier vide");
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  if (records.length === 0) return { rows: [], total: 0 };

  const keys = new Map<Field, string>();
  for (const header of Object.keys(records[0])) {
    const normalized = normalizeHeader(header);
    for (const field of Object.keys(COLUMNS) as Field[]) {
      if (!keys.has(field) && (COLUMNS[field] as readonly string[]).includes(normalized)) {
        keys.set(field, header);
      }
    }
  }
  if (!keys.has("client") || !keys.has("amount")) {
    throw new Error("Colonnes « client » et « original_amount » introuvables");
  }

  const fallbackMonth = monthIndexFromName(name);
  const year = new Date().getFullYear();
  const get = (record: Record<string, unknown>, field: Field) =>
    keys.has(field) ? record[keys.get(field)!] : "";

  const rows: RawRow[] = [];
  records.forEach((record, index) => {
    const client = String(get(record, "client") ?? "").trim();
    if (!client) return;
    const amount = toNumber(get(record, "amount")) / divisor;
    const date =
      toDate(get(record, "date")) ??
      (fallbackMonth != null ? `${year}-${pad(fallbackMonth + 1)}-01` : null);
    if (!date) return;
    rows.push({
      date,
      ref: String(get(record, "ref") ?? "").trim() || `${name}-${index + 1}`,
      client: titleCase(client),
      amount,
      transferred: keys.has("transferred") ? toNumber(get(record, "transferred")) / divisor : amount,
      commission: toNumber(get(record, "commission")) / divisor,
      retained: toNumber(get(record, "retained")) / divisor,
      file: name,
    });
  });
  return { rows, total: records.length };
}

function listSourceFiles(): { name: string; size: number; mtime: number }[] {
  ensureDataDir();
  return fs
    .readdirSync(DATA_DIR)
    .filter(
      (name) =>
        !name.startsWith(".") &&
        !name.startsWith("~$") &&
        ACCEPTED_EXTENSIONS.includes(path.extname(name).toLowerCase()),
    )
    .map((name) => {
      const stat = fs.statSync(path.join(DATA_DIR, name));
      return { name, size: stat.size, mtime: stat.mtimeMs };
    })
    .filter((f) => f.size > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
}

function readRegistry(): Registry {
  try {
    const raw = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8"));
    return { numbers: raw.numbers ?? {}, counters: raw.counters ?? {} };
  } catch {
    return { numbers: {}, counters: {} };
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function build(version: string, sources: ReturnType<typeof listSourceFiles>): Dataset {
  const settings = getSettings();
  const divisor = settings.amountsInCents ? 100 : 1;
  const files: SourceFile[] = [];
  const sales: RawRow[] = [];
  const retentions: Retention[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    const info: SourceFile = {
      ...source,
      rows: 0,
      invoices: 0,
      retentions: 0,
      duplicates: 0,
      months: [],
      total: 0,
    };
    try {
      const { rows, total } = parseFile(source.name, divisor);
      info.rows = total;
      const months = new Set<string>();
      for (const row of rows) {
        const key = [row.ref, row.date, row.amount, row.retained].join("|");
        if (seen.has(key)) {
          info.duplicates += 1;
          continue;
        }
        seen.add(key);
        months.add(row.date.slice(0, 7));
        if (row.amount > 0) {
          sales.push(row);
          info.invoices += 1;
          info.total = round2(info.total + row.amount);
        } else if (row.retained > 0) {
          retentions.push({
            ref: row.ref,
            date: row.date,
            month: row.date.slice(0, 7),
            client: row.client,
            amount: row.retained,
            file: row.file,
          });
          info.retentions += 1;
        }
      }
      info.months = [...months].sort();
    } catch (error) {
      info.error = error instanceof Error ? error.message : "Fichier illisible";
    }
    files.push(info);
  }

  sales.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));

  // Numérotation stable : un numéro attribué n'est jamais réutilisé ni modifié.
  const registry = readRegistry();
  let registryChanged = false;
  const usedIds = new Map<string, number>();
  const invoices: Invoice[] = sales.map((row) => {
    const occurrence = (usedIds.get(row.ref) ?? 0) + 1;
    usedIds.set(row.ref, occurrence);
    const id = (occurrence === 1 ? row.ref : `${row.ref}-${occurrence}`).replace(/[^A-Za-z0-9_-]/g, "_");
    const month = row.date.slice(0, 7);
    let number = registry.numbers[id];
    if (!number) {
      const next = (registry.counters[month] ?? 0) + 1;
      registry.counters[month] = next;
      number = `${settings.invoicePrefix}-${month}-${String(next).padStart(3, "0")}`;
      registry.numbers[id] = number;
      registryChanged = true;
    }
    return {
      id,
      number,
      ref: row.ref,
      date: row.date,
      month,
      client: row.client,
      amount: row.amount,
      transferred: row.transferred,
      commission: row.commission,
      retained: row.retained,
      net: round2(row.transferred - row.commission - row.retained),
      file: row.file,
    };
  });
  if (registryChanged) fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));

  retentions.sort((a, b) => a.date.localeCompare(b.date));
  return { version, invoices, retentions, files };
}

const cache = globalThis as unknown as { __factureDataset?: Dataset };

/** Signature de l'état du dossier : change dès qu'un fichier est ajouté, modifié ou supprimé. */
export function getVersion(): string {
  const sources = listSourceFiles();
  return [settingsMtime(), ...sources.map((f) => `${f.name}:${f.size}:${f.mtime}`)].join("|");
}

/** Lit tous les fichiers du dossier data/ (résultat mis en cache tant que rien ne change). */
export function getDataset(): Dataset {
  const sources = listSourceFiles();
  const version = [settingsMtime(), ...sources.map((f) => `${f.name}:${f.size}:${f.mtime}`)].join("|");
  if (cache.__factureDataset?.version === version) return cache.__factureDataset;
  const dataset = build(version, sources);
  cache.__factureDataset = dataset;
  return dataset;
}

export function findInvoice(id: string): Invoice | undefined {
  return getDataset().invoices.find((invoice) => invoice.id === id);
}
