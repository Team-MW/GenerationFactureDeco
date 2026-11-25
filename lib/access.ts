/**
 * Protection par code d'accès : tout le site demande ce code avant d'afficher quoi que ce soit.
 * Le code est écrit ici ; la variable APP_PASSWORD, si elle est définie, le remplace.
 */
const ACCESS_CODE = "3131";
export const ACCESS_COOKIE = "acces";

export const accessPassword = () => process.env.APP_PASSWORD || ACCESS_CODE;

/** Jeton stocké dans le cookie : empreinte du code, jamais le code lui-même. */
export async function accessToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${password}:gestion-acces-v1`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
