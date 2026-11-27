/**
 * Comptes utilisateurs Clerk. Actifs seulement quand les deux clés sont présentes dans les variables d'environnement :
 * sans elles (par exemple sur un hébergement où elles n'ont pas été ajoutées), l'application garde uniquement le code d'accès.
 */
export const CLERK_ON = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
/** Page de connexion par compte (le code à 4 chiffres reste sur /connexion). */
export const ACCOUNT_PATH = "/compte";
