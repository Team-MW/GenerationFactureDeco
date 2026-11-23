import fs from "node:fs";
import path from "node:path";
import type { Settings } from "./types";

export const DATA_DIR = path.join(process.cwd(), "data");
export const OUTPUT_DIR = path.join(process.cwd(), "factures");
/**
 * Sur Vercel (et tout hébergement « serverless »), le disque est en lecture seule :
 * l'application lit les fichiers livrés avec le déploiement mais ne peut rien enregistrer.
 */
export const READ_ONLY = Boolean(process.env.VERCEL);
export const READ_ONLY_MESSAGE =
  "Version en ligne en lecture seule : ajoutez ou modifiez les fichiers du dossier data/ dans le projet, puis redéployez.";

export function readOnlyResponse(): Response {
  return Response.json({ error: READ_ONLY_MESSAGE }, { status: 503 });
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

export function settingsMtime(): number {
  try {
    return fs.statSync(SETTINGS_FILE).mtimeMs;
  } catch {
    return 0;
  }
}

export function getSettings(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(input: Partial<Settings>): Settings {
  ensureDataDir();
  const next: Settings = { ...getSettings() };
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
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

const LOGO_EXTENSIONS = ["png", "jpg", "jpeg"];

export function getLogoPath(): string | null {
  for (const ext of LOGO_EXTENSIONS) {
    const p = path.join(DATA_DIR, `logo.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function removeLogo() {
  for (const ext of LOGO_EXTENSIONS) {
    fs.rmSync(path.join(DATA_DIR, `logo.${ext}`), { force: true });
  }
}

export function saveLogo(buffer: Buffer, ext: string) {
  ensureDataDir();
  removeLogo();
  fs.writeFileSync(path.join(DATA_DIR, `logo.${ext}`), buffer);
}
