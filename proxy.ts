import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, accessPassword, accessToken } from "./lib/access";

const PUBLIC_FILES = new Set(["/icon.png", "/apple-icon.png", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"]);

/** Bloque toute page et toute API tant que le code d'accès n'a pas été saisi. */
export async function proxy(request: NextRequest) {
  const password = accessPassword();
  if (!password) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/connexion") return NextResponse.next();
  // Icônes et fiche d'installation : le téléphone les demande sans le code d'accès.
  if (PUBLIC_FILES.has(pathname)) return NextResponse.next();
  // Page de signature du bon de commande : ouverte au client, protégée par le jeton secret du lien.
  if (pathname.startsWith("/signer/") || pathname.startsWith("/api/signer/")) return NextResponse.next();
  if (request.cookies.get(ACCESS_COOKIE)?.value === (await accessToken(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  const login = new URL("/connexion", request.url);
  if (pathname !== "/") login.searchParams.set("retour", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Tout sauf les fichiers statiques de Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
