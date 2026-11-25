import { headers } from "next/headers";
import { log, now } from "./build";
import { signatureMatches, snapshotOf } from "./logic";
import { loadScope, mutateIn, type Scope } from "./store";
import type { Order } from "./types";

/**
 * Signature électronique du bon de commande.
 *
 * Le client reçoit un lien secret (/signer/<jeton>) dans l'e-mail du bon de commande. Il y voit son bon,
 * signe au doigt, et la signature est enregistrée sur la commande avec la date, l'adresse IP et une copie
 * figée de ce qu'il a signé. Cette page est la seule ouverte sans le code d'accès du site.
 */
export class SignError extends Error {}

const TOKEN = /^[0-9a-f]{32,64}$/;

/** Retrouve la commande d'un lien de signature (vraies commandes, puis jeu de test). */
export async function findBySignToken(token: string): Promise<{ order: Order; scope: Scope } | null> {
  if (!TOKEN.test(token)) return null;
  // Lecture directe en base, jamais depuis le cache : en ligne, la page qui s'affiche après la signature
  // peut être servie par un autre serveur que celui qui vient de l'enregistrer.
  for (const scope of ["real", "test"] as const) {
    const order = (await loadScope(scope, true)).orders.find((o) => o.signToken === token);
    if (order) return { order, scope };
  }
  return null;
}

/** Vérifie le tracé reçu du navigateur : uniquement des « M x y » et « L x y » dans le cadre 600 × 200, et un vrai trait. */
export function cleanSignaturePath(value: unknown): string {
  const path = typeof value === "string" ? value.trim() : "";
  if (path.length < 20 || path.length > 40000 || !/^(?:[ML]\d{1,3} \d{1,3} ?)+$/.test(path)) throw new SignError("Signature illisible : recommencez.");
  const points = [...path.matchAll(/[ML](\d{1,3}) (\d{1,3})/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  if (Math.max(...xs) > 600 || Math.max(...ys) > 200) throw new SignError("Signature illisible : recommencez.");
  // Un simple point ou un trait minuscule n'est pas une signature.
  if (points.length < 12 || Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys)) < 60) throw new SignError("Signature trop courte : signez dans le cadre.");
  return path;
}

/** Enregistre la signature du client. */
export async function signOrder(token: string, rawPath: unknown, ip: string): Promise<Order> {
  const path = cleanSignaturePath(rawPath);
  const found = await findBySignToken(token);
  if (!found) throw new SignError("Ce lien de signature n'est plus valable.");
  return mutateIn(found.scope, (db) => {
    const order = db.orders.find((o) => o.signToken === token);
    if (!order) throw new SignError("Ce lien de signature n'est plus valable.");
    if (order.status === "cancelled") throw new SignError("Cette commande a été annulée.");
    if (order.signature && signatureMatches(order)) throw new SignError("Ce bon de commande est déjà signé.");
    order.signature = { at: now(), path, ip: ip.slice(0, 60), snapshot: snapshotOf(order) };
    log(order, "Bon de commande signé en ligne par le client");
    return structuredClone(order);
  });
}

/** Adresse publique du site, pour les liens placés dans les e-mails. APP_URL la fixe ; sinon celle de la requête en cours. */
export async function siteUrl(): Promise<string> {
  const fixed = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? (/^(localhost|127\.|192\.168\.)/.test(host) ? "http" : "https")}://${host}`;
  } catch {
    // hors d'une requête
  }
  return process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";
}

export const signUrl = async (order: Pick<Order, "signToken">) => (order.signToken ? `${await siteUrl()}/signer/${order.signToken}` : "");
