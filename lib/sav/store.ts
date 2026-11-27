import fs from "node:fs";
import path from "node:path";
import { isDate } from "../orders/build";
import { cleanTime } from "../orders/logic";
import { currentScope } from "../orders/store";
import { DATA_DIR, READ_ONLY, ensureDataDir } from "../settings";
import { USES_SUPABASE, readValue, writeValue } from "../supabase";
import { SAV_KINDS, SAV_STATUS, type SavDb, type SavKind, type SavStatus, type SavTicket } from "./types";

/**
 * Demandes de SAV. Enregistrées dans la table des paramètres (clé « gestion_sav »), ou dans data/sav.json en local.
 * Le mode test a sa propre copie : les essais ne touchent jamais aux vraies demandes.
 */
const memory = globalThis as unknown as { __sav?: Record<string, SavDb> };
const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

/** Moment d'un rendez-vous : journée, demi-journée ou heure précise. */
export const cleanMoment = (value: unknown): string => (value === "matin" || value === "apres-midi" ? value : cleanTime(value));

/** Remet en forme ce qui vient de la base : rien d'invalide ne passe. */
export function cleanSav(input: unknown): SavDb {
  const raw = (input ?? {}) as Partial<SavDb>;
  const tickets: SavTicket[] = (Array.isArray(raw.tickets) ? raw.tickets : [])
    .slice(0, 5000)
    .filter((t) => t && t.id && t.number)
    .map((t) => ({
      id: text(t.id, 24),
      number: text(t.number, 20),
      createdAt: text(t.createdAt, 40),
      customer: {
        name: text(t.customer?.name, 120),
        phone: text(t.customer?.phone, 40),
        email: text(t.customer?.email, 160),
        address: text(t.customer?.address, 200),
        postalCode: text(t.customer?.postalCode, 12),
        city: text(t.customer?.city, 80),
      },
      orderNumber: text(t.orderNumber, 40),
      product: text(t.product, 200),
      kind: (t.kind in SAV_KINDS ? t.kind : "autre") as SavKind,
      problem: text(t.problem, 2000),
      status: (t.status in SAV_STATUS ? t.status : "nouvelle") as SavStatus,
      visitDate: isDate(t.visitDate) ? t.visitDate : null,
      visitMoment: cleanMoment(t.visitMoment),
      technician: text(t.technician, 80),
      visitNote: text(t.visitNote, 500),
      report: text(t.report, 2000),
      doneAt: t.doneAt ? text(t.doneAt, 40) : null,
      refunded: typeof t.refunded === "number" && t.refunded >= 0 ? Math.round(t.refunded * 100) / 100 : null,
      history: (Array.isArray(t.history) ? t.history : []).slice(-100).map((h) => ({ at: text(h?.at, 40), text: text(h?.text, 300) })),
    }));
  return { tickets, counter: Math.max(0, Math.floor(Number(raw.counter) || 0), tickets.length) };
}

const key = async () => ((await currentScope()) === "test" ? "gestion_sav_test" : "gestion_sav");
const file = (name: string) => path.join(DATA_DIR, `${name.replace("gestion_", "")}.json`);

export async function getSav(): Promise<SavDb> {
  const name = await key();
  if (USES_SUPABASE) return cleanSav(await readValue<SavDb>(name));
  if (READ_ONLY) return cleanSav(memory.__sav?.[name]);
  try {
    return cleanSav(JSON.parse(fs.readFileSync(file(name), "utf8")));
  } catch {
    return cleanSav(null);
  }
}

/** Lit les demandes, applique la modification et enregistre le tout. */
export async function mutateSav<T>(change: (db: SavDb) => T): Promise<T> {
  const name = await key();
  const db = await getSav();
  const result = change(db);
  const value = cleanSav(db);
  if (USES_SUPABASE) await writeValue(name, value);
  else if (READ_ONLY) (memory.__sav ??= {})[name] = value;
  else {
    ensureDataDir();
    fs.writeFileSync(file(name), JSON.stringify(value, null, 2));
  }
  return result;
}

/** Vide les demandes du mode test (quand on recharge la simulation). */
export async function resetTestSav(): Promise<void> {
  const name = "gestion_sav_test";
  const value = cleanSav(null);
  if (USES_SUPABASE) await writeValue(name, value);
  else if (READ_ONLY) (memory.__sav ??= {})[name] = value;
  else fs.rmSync(file(name), { force: true });
}
