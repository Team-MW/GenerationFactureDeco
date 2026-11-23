/** Silhouette grise affichée pendant le chargement d'une page. */
export default function PageSkeleton({ cards = 4, full = false }: { cards?: number; full?: boolean }) {
  const body = (
    <div className="animate-pulse" role="status" aria-label="Chargement en cours">
      <div className="mb-6">
        <div className="h-7 w-56 rounded-lg bg-slate-200" />
        <div className="mt-2 h-4 w-80 max-w-full rounded bg-slate-200/70" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="mt-4 h-72 rounded-xl border border-slate-200 bg-white" />
      <div className="mt-4 h-40 rounded-xl border border-slate-200 bg-white" />
      <span className="sr-only">Chargement…</span>
    </div>
  );
  // « full » : pages dont l'habillage (menu) n'est pas encore affiché.
  return full ? <div className="mx-auto min-h-dvh max-w-[1280px] px-4 py-8 sm:px-8">{body}</div> : body;
}
