"use client";

import { RefreshCw } from "lucide-react";

/** Affiché quand une page ne peut pas se charger (le plus souvent : base de données inaccessible). */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-full place-items-center bg-black px-5 text-white">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Cette page n&apos;a pas pu se charger</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          La base de données est momentanément inaccessible, ou sa configuration est incomplète (clé
          SUPABASE_SECRET_KEY, ou fichier DB/00_installation_complete.sql non exécuté). Vos données ne sont pas perdues.
        </p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-neutral-200">
            <RefreshCw size={16} /> Réessayer
          </button>
          <a href="/" className="rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-300 hover:bg-white/10">
            Retour à l&apos;accueil
          </a>
        </div>
      </div>
    </main>
  );
}
