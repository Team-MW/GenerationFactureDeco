import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDataset } from "./data";
import { MONTHS } from "./format";
import { renderInvoicePdf } from "./pdf";
import { OUTPUT_DIR, getLogoPath, getSettings } from "./settings";
import type { Invoice, Settings } from "./types";

const STATE_FILE = path.join(OUTPUT_DIR, ".etat.json");
/** À incrémenter quand la mise en page du PDF change, pour régénérer les factures existantes. */
const TEMPLATE_VERSION = 3;

interface State {
  done: Record<string, { path: string; key: string }>;
}

function readState(): State {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return { done: raw.done ?? {} };
  } catch {
    return { done: {} };
  }
}

function writeState(state: State) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function logoSignature(logo: string | null): string {
  if (!logo) return "";
  try {
    return `${logo}:${fs.statSync(logo).mtimeMs}`;
  } catch {
    return "";
  }
}

/** Empreinte de tout ce qui influe sur le rendu d'une facture. */
function invoiceKey(invoice: Invoice, settings: Settings, logo: string | null): string {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify([TEMPLATE_VERSION, invoice, settings, logoSignature(logo)]))
    .digest("hex");
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();

export function invoiceFileName(invoice: Invoice): string {
  return `${invoice.number} - ${safe(invoice.client)}.pdf`;
}

export function monthFolder(month: string): string {
  const index = Number(month.split("-")[1]) - 1;
  return `${month} ${MONTHS[index] ?? ""}`.trim();
}

/** Retourne le PDF d'une facture : relu depuis le disque s'il est à jour, sinon régénéré et enregistré. */
export async function getInvoicePdf(invoice: Invoice, shared?: State): Promise<Buffer> {
  const settings = getSettings();
  const logo = getLogoPath();
  const key = invoiceKey(invoice, settings, logo);
  const state = shared ?? readState();
  const existing = state.done[invoice.id];

  if (existing?.key === key) {
    try {
      return fs.readFileSync(path.join(OUTPUT_DIR, existing.path));
    } catch {
      // fichier supprimé à la main : on le régénère
    }
  }

  const buffer = await renderInvoicePdf(invoice, settings, logo);
  const relative = path.join(monthFolder(invoice.month), invoiceFileName(invoice));
  const target = path.join(OUTPUT_DIR, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (existing && existing.path !== relative) {
    fs.rmSync(path.join(OUTPUT_DIR, existing.path), { force: true });
  }
  fs.writeFileSync(target, buffer);
  state.done[invoice.id] = { path: relative, key };
  if (!shared) writeState(state);
  return buffer;
}

const lock = globalThis as unknown as { __factureGenerating?: Promise<number> };

/** Génère sur le disque les PDF manquants ou obsolètes. Retourne le nombre de PDF écrits. */
export function generateMissing(): Promise<number> {
  if (lock.__factureGenerating) return lock.__factureGenerating;
  const run = (async () => {
    const { invoices } = getDataset();
    if (invoices.length === 0) return 0;
    const settings = getSettings();
    const logo = getLogoPath();
    const state = readState();
    let written = 0;
    for (const invoice of invoices) {
      const existing = state.done[invoice.id];
      const upToDate =
        existing?.key === invoiceKey(invoice, settings, logo) &&
        fs.existsSync(path.join(OUTPUT_DIR, existing.path));
      if (upToDate) continue;
      await getInvoicePdf(invoice, state);
      written += 1;
      if (written % 20 === 0) writeState(state);
    }
    if (written > 0) writeState(state);
    return written;
  })();
  lock.__factureGenerating = run.finally(() => {
    lock.__factureGenerating = undefined;
  });
  return lock.__factureGenerating;
}
