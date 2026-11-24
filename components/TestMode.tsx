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
          <span className="hidden sm:inline">Mode test : commandes fictives, rien n&apos;est enregistré dans vos vraies données</span>
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
      <div className="pointer-events-none fixed bottom-20 left-3 z-[60] inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-black shadow-lg md:bottom-4 md:left-[17rem]">
        <FlaskConical size={14} /> Mode test
      </div>
    </>
  );
}

/** Gros bouton de la page d'accueil : passe du réel au test, et inversement. */
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
    <div className={`mt-4 rounded-2xl border p-5 transition sm:p-6 ${active ? "border-amber-400 bg-amber-400 text-black" : "border-white/10 bg-neutral-950 text-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${active ? "bg-black text-amber-400" : "bg-white/10"}`}>
            <FlaskConical size={22} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">{active ? "Mode test activé" : "Mode test"}</h2>
            <p className={`mt-0.5 text-sm ${active ? "text-black/70" : "text-neutral-400"}`}>
              {active
                ? "Vous voyez des commandes fictives. Tout ce que vous faites ici reste à part de vos vraies données."
                : "Essayez l'application avec sept commandes fictives : bons de commande, planning, magasinier, tournée du livreur."}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {active ? (
            <button type="button" disabled={pending} onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/20 px-4 py-3 text-sm font-semibold transition hover:bg-black/10">
              <RotateCcw size={16} /> Recharger la simulation
            </button>
          ) : null}
          <button
            type="button"
            role="switch"
            aria-checked={active}
            disabled={pending}
            onClick={toggle}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold transition ${active ? "bg-black text-white hover:bg-neutral-800" : "bg-amber-400 text-black hover:bg-amber-300"}`}
          >
            {pending ? <Loader2 size={18} className="animate-spin" /> : <FlaskConical size={18} />}
            {active ? "Revenir aux vraies données" : "Activer le mode test"}
          </button>
        </div>
      </div>
    </div>
  );
}
