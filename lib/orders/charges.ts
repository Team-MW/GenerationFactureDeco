import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, READ_ONLY, ensureDataDir } from "../settings";
import { USES_SUPABASE, readValue, writeValue } from "../supabase";
import { DEFAULT_PRICING, guessCategory, type Charge, type ChargeCategory, type ChargePeriod, type CostItem, type CostKind, type PricingSettings, type Transport } from "./pricing";
import { currentScope } from "./store";

/**
 * Charges fixes du magasin (loyer, salaires…) et réglages du calcul des prix de vente.
 * Enregistrés dans la table des paramètres (clé « gestion_charges »), ou dans data/charges.json en local.
 * Le mode test a sa propre copie : les essais ne touchent jamais aux vraies charges.
 */
const memory = globalThis as unknown as { __charges?: Record<string, PricingSettings> };
const PERIODS: ChargePeriod[] = ["mois", "trimestre", "an"];
const CATEGORIES: ChargeCategory[] = ["loyer", "salaire", "energie", "vehicule", "service", "autre"];

/** Remet en forme ce qui vient de la base ou du navigateur : rien d'invalide ne passe. */
export function cleanPricing(input: unknown): PricingSettings {
  const raw = (input ?? {}) as Partial<PricingSettings>;
  const number = (value: unknown, max: number) => Math.min(max, Math.max(0, Math.round((Number(value) || 0) * 100) / 100));
  const charges: Charge[] = (Array.isArray(raw.charges) ? raw.charges : [])
    .slice(0, 200)
    .map((c, index) => ({
      id: String(c?.id || `c${index + 1}`).slice(0, 24),
      label: String(c?.label ?? "").trim().slice(0, 80),
      amount: number(c?.amount, 10_000_000),
      period: PERIODS.includes(c?.period as ChargePeriod) ? (c.period as ChargePeriod) : "mois",
      // Charges enregistrées avant l'ajout des familles : on la déduit du nom.
      category: CATEGORIES.includes(c?.category as ChargeCategory) ? (c.category as ChargeCategory) : guessCategory(String(c?.label ?? "")),
      note: String(c?.note ?? "").trim().slice(0, 160),
    }))
    .filter((c) => c.label !== "");
  const KINDS: CostKind[] = ["euro", "pct-achat", "pct-vente"];
  const costItems: CostItem[] = (Array.isArray(raw.costItems) ? raw.costItems : [])
    .slice(0, 40)
    .map((item, index) => {
      const kind = KINDS.includes(item?.kind as CostKind) ? (item.kind as CostKind) : "euro";
      return { id: String(item?.id || `p${index + 1}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || `p${index + 1}`, label: String(item?.label ?? "").trim().slice(0, 60), kind, value: number(item?.value, kind === "euro" ? 1_000_000 : 100) };
    })
    .filter((item) => item.label !== "");
  const transports: Transport[] = (Array.isArray(raw.transports) ? raw.transports : [])
    .slice(0, 500)
    .map((t, index) => ({
      id: String(t?.id || `t${index + 1}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || `t${index + 1}`,
      number: String(t?.number ?? "").trim().slice(0, 40),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(t?.date ?? "")) ? String(t.date) : "",
      cost: number(t?.cost, 10_000_000),
      note: String(t?.note ?? "").trim().slice(0, 200),
    }))
    .filter((t) => t.number !== "");
  return {
    charges,
    transports,
    costItems,
    monthlyRevenue: number(raw.monthlyRevenue, 100_000_000),
    revenueBasis: raw.revenueBasis === "ht" ? "ht" : "ttc",
    employerRate: number(raw.employerRate, 100),
    grossMarginTarget: raw.grossMarginTarget === undefined ? DEFAULT_PRICING.grossMarginTarget : number(raw.grossMarginTarget, 95),
    targetMargin: raw.targetMargin === undefined ? DEFAULT_PRICING.targetMargin : number(raw.targetMargin, 80),
    rounding: [0, 1, 5, 10, 50].includes(Number(raw.rounding)) ? Number(raw.rounding) : DEFAULT_PRICING.rounding,
  };
}

const key = async () => ((await currentScope()) === "test" ? "gestion_charges_test" : "gestion_charges");
const file = (name: string) => path.join(DATA_DIR, `${name.replace("gestion_", "")}.json`);

export async function getPricing(): Promise<PricingSettings> {
  const name = await key();
  if (USES_SUPABASE) return cleanPricing(await readValue<PricingSettings>(name));
  if (READ_ONLY) return cleanPricing(memory.__charges?.[name]);
  try {
    return cleanPricing(JSON.parse(fs.readFileSync(file(name), "utf8")));
  } catch {
    return cleanPricing(null);
  }
}

export async function savePricing(input: unknown): Promise<PricingSettings> {
  const name = await key();
  const value = cleanPricing(input);
  if (USES_SUPABASE) await writeValue(name, value);
  else if (READ_ONLY) (memory.__charges ??= {})[name] = value;
  else {
    ensureDataDir();
    fs.writeFileSync(file(name), JSON.stringify(value, null, 2));
  }
  return value;
}
