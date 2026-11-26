"use client";

import { FlaskConical, Loader2, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { resetSimulation, setTestMode } from "@/app/mode/actions";
import { toast } from "@/lib/client";
import { confirmDialog } from "./ConfirmDialog";

/** Bandeau affiché sur toutes les pages tant que le mode test est actif. */
export function TestBanner() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-3 py-1.5 text-sm font-medium text-black sm:px-4 sm:py-2">
        <span className="inline-flex items-center gap-2">
          <FlaskConical size={16} />
          <span className="sm:hidden">Mode test · commandes fictives</span>
          <span className="hidden sm:inline">Mode test : commandes, stock et planning fictifs. Vos vraies commandes ne sont pas touchées.</span>
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await setTestMode(false); router.refresh(); })}
          className="inline-flex items-center gap-1.5 rounded-full bg-black px-3 py-1 text-xs font-semibold text-white transition hover:bg-neutral-800"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Quitter<span className="hidden sm:inline"> le mode test</span>
        </button>
      </div>
      {/* Rappel toujours visible, même après avoir fait défiler la page */}
      <div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-black shadow-lg md:bottom-3">
        <FlaskConical size={14} /> Mode test
      </div>
    </>
  );
}

/** Petit interrupteur de la page d'accueil : passe du réel au test, et inversement. */
export function TestModeSwitch({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      await setTestMode(!active);
      toast(active ? "Mode test quitté : vous êtes sur vos vraies données" : "Mode test activé : commandes fictives", "info");
      router.refresh();
    });
  const reset = async () => {
    const ok = await confirmDialog({
      title: "Recharger la simulation ?",
      message: "Les commandes de test actuelles sont remplacées par les sept commandes fictives de départ, datées d'aujourd'hui. Vos vraies données ne sont pas touchées.",
      confirmLabel: "Recharger",
    });
    if (!ok) return;
    start(async () => {
      const result = await resetSimulation();
      toast(result.ok ? "Simulation rechargée" : (result.error ?? "Réinitialisation impossible"), result.ok ? "success" : "error");
      router.refresh();
    });
  };

  return (
    <span className="inline-flex items-center gap-1">
      {active ? (
        <button type="button" disabled={pending} onClick={reset} title="Recharger la simulation de départ" aria-label="Recharger la simulation de départ" className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white">
          <RotateCcw size={15} />
        </button>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={active}
        disabled={pending}
        onClick={toggle}
        title={active ? "Revenir aux vraies données" : "Essayer l'application avec des commandes fictives"}
        className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${active ? "bg-amber-400 text-black hover:bg-amber-300" : "text-neutral-400 hover:bg-white/10 hover:text-white"}`}
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />}
        Mode test
        {/* Interrupteur : à droite et noir quand le mode test est actif. */}
        <span className={`relative h-4 w-7 rounded-full transition ${active ? "bg-black" : "bg-white/20"}`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full transition-all ${active ? "left-3.5 bg-amber-400" : "left-0.5 bg-white"}`} />
        </span>
      </button>
    </span>
  );
}
