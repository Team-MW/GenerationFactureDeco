import fs from "node:fs";
import path from "node:path";
import { USES_SUPABASE, readValue, writeValue } from "./supabase";
import type { Settings } from "./types";

export const DATA_DIR = path.join(process.cwd(), "data");
export const OUTPUT_DIR = path.join(process.cwd(), "factures");

/** Sur Vercel (et tout hébergement « serverless »), le disque est en lecture seule. */
export const READ_ONLY = Boolean(process.env.VERCEL);
/** L'application peut-elle enregistrer ? Oui avec Supabase, ou en local sur le disque. */
export const CAN_WRITE = USES_SUPABASE || !READ_ONLY;

export function readOnlyResponse(): Response {
  return Response.json(
    { error: "Enregistrement impossible : la base de données n'est pas configurée sur la version en ligne." },
    { status: 503 },
  );
}

const SETTINGS_FILE = path.join(DATA_DIR, "parametres.json");

export const DEFAULT_SETTINGS: Settings = {
  companyName: "Votre Société",
  legalForm: "SAS",
  capital: "",
  address: "1 rue de l'Exemple",
  postalCode: "75000",
  city: "Paris",
  country: "France",
  siret: "",
  rcs: "",
  vatNumber: "",
  email: "",
  phone: "",
  website: "",
  invoicePrefix: "FAC",
  designation: "Prestation de services",
  description: "",
  vatRate: 20,
  amountsIncludeVat: true,
  amountsInCents: true,
  paymentMethod: "Financement",
  footerNote: "",
  accentColor: "#1d4ed8",
};

export function ensureDataDir() {
  if (READ_ONLY) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/* ───────────────────────── Stockage clé / valeur ───────────────────────── */

const cache = globalThis as unknown as {
  __settings?: { at: number; value: Settings };
  __logo?: { at: number; value: Logo | null };
};
const TTL = 5000;

/* ───────────────────────── Paramètres ───────────────────────── */

function settingsFromFile(): Partial<Settings> | null {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return null;
  }
}

export async function getSettings(): Promise<Settings> {
  if (cache.__settings && Date.now() - cache.__settings.at < TTL) return cache.__settings.value;
  let stored: Partial<Settings> | null = null;
  if (USES_SUPABASE) {
    try {
      stored = await readValue<Partial<Settings>>("settings");
      if (!stored) {
        // Première utilisation de la base : on y recopie les paramètres du fichier local.
        stored = settingsFromFile();
        if (stored) await writeValue("settings", stored).catch(() => undefined);
      }
    } catch {
      // Base inaccessible : le nom de la société et l'habillage restent affichés grâce au fichier local.
      return { ...DEFAULT_SETTINGS, ...(settingsFromFile() ?? {}) };
    }
  } else {
    stored = settingsFromFile();
  }
  const value = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  cache.__settings = { at: Date.now(), value };
  return value;
}

export async function saveSettings(input: Partial<Settings>): Promise<Settings> {
  const next: Settings = { ...(await getSettings()) };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = input[key];
    if (value === undefined) continue;
    const def = DEFAULT_SETTINGS[key];
    if (typeof def === "number") {
      const n = Number(value);
      if (Number.isFinite(n)) (next[key] as number) = n;
    } else if (typeof def === "boolean") {
      (next[key] as boolean) = Boolean(value);
    } else {
      (next[key] as string) = String(value).trim();
    }
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(next.accentColor)) next.accentColor = DEFAULT_SETTINGS.accentColor;
  next.vatRate = Math.min(100, Math.max(0, next.vatRate));
  next.invoicePrefix = next.invoicePrefix.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "FAC";

  if (USES_SUPABASE) {
    await writeValue("settings", next);
  } else {
    ensureDataDir();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  }
  cache.__settings = { at: Date.now(), value: next };
  return next;
}

/* ───────────────────────── Logo ───────────────────────── */

export interface Logo {
  data: Buffer;
  format: "png" | "jpg";
  /** Change dès que le logo change : sert à savoir si les PDF sont à régénérer. */
  stamp: string;
}

const LOGO_EXTENSIONS = ["png", "jpg", "jpeg"] as const;

function logoFromFile(): Logo | null {
  for (const ext of LOGO_EXTENSIONS) {
    const file = path.join(DATA_DIR, `logo.${ext}`);
    try {
      const data = fs.readFileSync(file);
      return { data, format: ext === "png" ? "png" : "jpg", stamp: `${data.length}:${fs.statSync(file).mtimeMs}` };
    } catch {
      // extension suivante
    }
  }
  return null;
}

interface StoredLogo {
  format: "png" | "jpg";
  data: string;
  /** true = logo volontairement supprimé (ne pas reprendre celui du fichier local). */
  removed?: boolean;
}

export async function getLogo(): Promise<Logo | null> {
  if (cache.__logo && Date.now() - cache.__logo.at < TTL) return cache.__logo.value;
  let value: Logo | null;
  if (USES_SUPABASE) {
    const stored = await readValue<StoredLogo>("logo");
    if (stored?.removed) {
      value = null;
    } else if (stored?.data) {
      value = { data: Buffer.from(stored.data, "base64"), format: stored.format, stamp: `${stored.data.length}:${stored.data.slice(-16)}` };
    } else {
      // Première utilisation de la base : on y recopie le logo du fichier local.
      value = logoFromFile();
      if (value) await writeValue("logo", { format: value.format, data: value.data.toString("base64") }).catch(() => undefined);
    }
  } else {
    value = logoFromFile();
  }
  cache.__logo = { at: Date.now(), value };
  return value;
}

export async function saveLogo(buffer: Buffer, ext: "png" | "jpg"): Promise<void> {
  if (USES_SUPABASE) {
    await writeValue("logo", { format: ext, data: buffer.toString("base64") });
  } else {
    ensureDataDir();
    for (const e of LOGO_EXTENSIONS) fs.rmSync(path.join(DATA_DIR, `logo.${e}`), { force: true });
    fs.writeFileSync(path.join(DATA_DIR, `logo.${ext}`), buffer);
  }
  cache.__logo = undefined;
}

export async function removeLogo(): Promise<void> {
  if (USES_SUPABASE) {
    await writeValue("logo", { format: "png", data: "", removed: true });
  } else {
    for (const e of LOGO_EXTENSIONS) fs.rmSync(path.join(DATA_DIR, `logo.${e}`), { force: true });
  }
  cache.__logo = undefined;
}
