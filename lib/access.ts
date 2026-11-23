/**
 * Protection par code d'accès.
 * Si la variable APP_PASSWORD est définie, tout le site demande ce code avant d'afficher quoi que ce soit.
 * Si elle est absente (usage local), le site reste ouvert.
 */
export const ACCESS_COOKIE = "acces";

export const accessPassword = () => process.env.APP_PASSWORD ?? "";

/** Jeton stocké dans le cookie : empreinte du code, jamais le code lui-même. */
export async function accessToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${password}:gestion-acces-v1`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
