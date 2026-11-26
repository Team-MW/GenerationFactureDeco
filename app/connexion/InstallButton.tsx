"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

/** Événement que Chrome et Edge envoient quand l'application peut être installée. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Device = "safari-mac" | "ios" | "chromium" | "autre";

function detect(): Device {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Chrome|Chromium|Edg\//.test(ua)) return "chromium";
  if (/Safari/.test(ua) && /Macintosh/.test(ua)) return "safari-mac";
  return "autre";
}

const STEPS: Record<Device, string[]> = {
  "safari-mac": ["Dans la barre de menus de Safari, cliquez sur « Fichier ».", "Choisissez « Ajouter au Dock… ».", "Validez avec « Ajouter » : l'icône DECOSHOP apparaît dans le Dock."],
  ios: ["Touchez le bouton Partager (le carré avec une flèche vers le haut).", "Choisissez « Sur l'écran d'accueil ».", "Validez avec « Ajouter »."],
  chromium: ["Cliquez sur les trois points en haut à droite du navigateur.", "Ouvrez « Caster, enregistrer et partager ».", "Choisissez « Installer la page en tant qu'application », puis « Installer »."],
  autre: ["Ouvrez cette page avec Safari ou Google Chrome.", "Revenez ensuite sur ce bouton pour installer l'application."],
};

/**
 * Bouton « Installer l'application » : ouvre la fenêtre d'installation du navigateur quand il en propose une
 * (Chrome, Edge), sinon affiche la marche à suivre (Safari sur Mac : Fichier > Ajouter au Dock).
 */
export default function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(true); // masqué jusqu'à savoir si l'application est déjà installée
  const [help, setHelp] = useState<Device | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!prompt) return setHelp(detect());
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    if (outcome !== "accepted") setHelp(null);
  };

  return (
    <div className="mt-8 border-t border-white/10 pt-6">
      <button type="button" onClick={install} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
        <Download size={16} /> Installer l&apos;application
      </button>
      <p className="mt-2 text-center text-xs text-neutral-500">Pour l&apos;ouvrir depuis le Dock ou l&apos;écran d&apos;accueil, comme une application.</p>
      {help ? (
        <div role="dialog" aria-label="Installer l'application" className="mt-4 rounded-xl border border-white/15 bg-neutral-950 p-4 text-sm text-neutral-200">
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold text-white">{help === "safari-mac" ? "Sur ce Mac, avec Safari" : help === "ios" ? "Sur iPhone ou iPad" : help === "chromium" ? "Avec Chrome ou Edge" : "Installation"}</div>
            <button type="button" onClick={() => setHelp(null)} aria-label="Fermer" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-neutral-400 hover:bg-white/10 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <ol className="mt-2 list-inside list-decimal space-y-1.5 text-neutral-300">
            {STEPS[help].map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {help === "safari-mac" ? <p className="mt-3 text-xs text-neutral-500">« Ajouter au Dock » existe à partir de macOS Sonoma (14). Sur un Mac plus ancien, ouvrez cette page avec Google Chrome et recliquez sur ce bouton.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
