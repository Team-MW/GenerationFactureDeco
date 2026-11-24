/**
 * Connexion à Supabase, côté serveur uniquement.
 * Active dès que SUPABASE_URL et SUPABASE_SECRET_KEY sont définies ; sinon l'application
 * enregistre dans des fichiers locaux (dossier data/).
 *
 * Les appels passent directement par l'API REST de la base (fetch) : aucune dépendance,
 * et le même comportement sur toutes les versions de Node.
 */
const URL_BASE = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
// La clé secrète ne doit jamais partir vers le navigateur : ce module n'est importé que par du code serveur.
const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const USES_SUPABASE = Boolean(URL_BASE && SECRET);

export class StoreError extends Error {}

/** Traduit une erreur technique en message compréhensible. */
export function explain(message: string): StoreError {
  if (/invalid api key|jwt|permission denied|not authorized|unauthorized/i.test(message)) {
    return new StoreError("Accès à la base refusé : la clé SUPABASE_SECRET_KEY n'est pas celle de ce projet Supabase.");
  }
  if (/schema cache|does not exist|could not find/i.test(message)) {
    return new StoreError("Base de données non à jour : relancez DB/00_installation_complete.sql dans Supabase.");
  }
  return new StoreError("La base de données ne répond pas. Réessayez dans un instant.");
}

async function request<T>(path: string, init: RequestInit & { headers?: Record<string, string> }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: SECRET, "Content-Type": "application/json", ...init.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error("[supabase] réseau :", error instanceof Error ? error.message : error);
    throw new StoreError("La base de données ne répond pas. Réessayez dans un instant.");
  }
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {
      // réponse non JSON
    }
    console.error(`[supabase] ${path.split("?")[0]} : HTTP ${response.status} ${message}`);
    throw explain(`${response.status} ${message}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** Appelle une fonction SQL et renvoie son résultat, ou lève une erreur lisible. */
export function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  return request<T>(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
}

/** Lit une valeur de la table deco_settings (null si absente). */
export async function readValue<T>(key: string): Promise<T | null> {
  const rows = await request<{ value: T }[]>(`deco_settings?select=value&key=eq.${encodeURIComponent(key)}`, { method: "GET" });
  return rows?.[0]?.value ?? null;
}

/**
 * Remplace une valeur seulement si son numéro de version (champ « version » du JSON) est celui attendu.
 * Renvoie false si quelqu'un d'autre l'a modifiée entre-temps.
 */
export async function replaceValueIfVersion(key: string, expectedVersion: number, value: unknown): Promise<boolean> {
  const rows = await request<unknown[]>(`deco_settings?key=eq.${encodeURIComponent(key)}&value->>version=eq.${expectedVersion}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ value, updated_at: new Date().toISOString() }),
  });
  return Array.isArray(rows) && rows.length > 0;
}

/** Écrit (crée ou remplace) une valeur de la table deco_settings. */
export async function writeValue(key: string, value: unknown): Promise<void> {
  await request<null>("deco_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
  });
}
