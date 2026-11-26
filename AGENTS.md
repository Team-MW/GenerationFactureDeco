<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Calculs de coûts, de marges et de prix

Avant de toucher à un calcul de l'espace Stock (coût de revient, TVA, douane, transports, marges, coefficients, charges, prix plancher, PVC), lire `calcule.md` à la racine : il décrit chaque formule, les règles à respecter, où modifier quoi et les cas de référence à revérifier. Toutes les formules vivent dans `lib/orders/pricing.ts` ; les composants ne refont jamais un calcul.
