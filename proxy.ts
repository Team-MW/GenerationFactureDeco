import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { ACCESS_COOKIE, accessPassword, accessToken } from "./lib/access";
import { ACCOUNT_PATH, CLERK_ON } from "./lib/clerk";

const PUBLIC_FILES = new Set(["/icon.png", "/apple-icon.png", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest", "/sw.js"]);

/** Ce que tout le monde peut ouvrir sans compte ni code. */
function isPublic(pathname: string): boolean {
  // Icônes et fiche d'installation : le téléphone les demande avant toute connexion.
  if (PUBLIC_FILES.has(pathname)) return true;
  // Page de signature du bon de commande : ouverte au client, protégée par le jeton secret du lien.
  return pathname.startsWith("/signer/") || pathname.startsWith("/api/signer/");
}

/** Deuxième barrière : le code d'accès à 4 chiffres. */
async function codeGate(request: NextRequest) {
  const password = accessPassword();
  if (!password) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname === "/connexion") return NextResponse.next();
  if (request.cookies.get(ACCESS_COOKIE)?.value === (await accessToken(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  const login = new URL("/connexion", request.url);
  if (pathname !== "/") login.searchParams.set("retour", pathname + search);
  return NextResponse.redirect(login);
}

/** Première barrière : être connecté avec son compte. Ensuite seulement, le code. */
const withAccounts = clerkMiddleware(async (auth, request) => {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  const onAccountPage = pathname === ACCOUNT_PATH || pathname.startsWith(`${ACCOUNT_PATH}/`);
  const { userId } = await auth();
  if (!userId) {
    if (onAccountPage) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
    const signIn = new URL(ACCOUNT_PATH, request.url);
    if (pathname !== "/" && pathname !== "/connexion") signIn.searchParams.set("redirect_url", pathname + search);
    return NextResponse.redirect(signIn);
  }
  // Déjà connecté : la page de connexion n'a plus rien à montrer.
  if (onAccountPage) return NextResponse.redirect(new URL("/", request.url));
  return codeGate(request);
});

/** Bloque toute page et toute API tant que la personne n'est pas connectée (compte, puis code d'accès). */
export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (CLERK_ON) return withAccounts(request, event);
  if (isPublic(request.nextUrl.pathname)) return NextResponse.next();
  return codeGate(request);
}

export const config = {
  // Tout sauf les fichiers internes de Next (scripts, images optimisées, rechargement à chaud en développement).
  matcher: ["/((?!_next/|__nextjs|favicon.ico).*)"],
};
