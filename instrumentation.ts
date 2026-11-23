/**
 * Surveillance du dossier data/ (usage local) : dès qu'un fichier y est déposé, même sans passer
 * par l'interface, il est importé et les PDF manquants sont écrits dans factures/.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Hébergement en lecture seule (Vercel) : pas de dossier à surveiller ni de PDF à écrire.
  if (process.env.VERCEL) return;
  const g = globalThis as unknown as { __factureWatcher?: NodeJS.Timeout; __factureLastVersion?: string };
  if (g.__factureWatcher) return;

  const tick = async () => {
    try {
      const { getVersion } = await import("./lib/data");
      const version = await getVersion();
      if (version === g.__factureLastVersion) return;
      const { generateMissing } = await import("./lib/generate");
      const written = await generateMissing();
      g.__factureLastVersion = version;
      if (written > 0) console.log(`[factures] ${written} PDF générés dans le dossier factures/`);
    } catch (error) {
      console.error("[factures] génération automatique impossible :", error instanceof Error ? error.message : error);
    }
  };

  g.__factureWatcher = setInterval(tick, 10000);
  void tick();
}
