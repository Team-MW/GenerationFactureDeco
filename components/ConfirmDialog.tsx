"use client";

import { AlertTriangle, HelpCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Request {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** « danger » : action définitive (bouton rouge). */
  tone?: "default" | "danger";
  resolve: (ok: boolean) => void;
}

/** Ouvre la fenêtre de confirmation de l'application et attend la réponse. */
export function confirmDialog(options: Omit<Request, "resolve">): Promise<boolean> {
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent("app-confirm", { detail: { ...options, resolve } })));
}

/** Fenêtre de confirmation, à placer une fois dans la page. */
export default function ConfirmDialog() {
  const [request, setRequest] = useState<Request | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onRequest = (event: Event) => setRequest((event as CustomEvent<Request>).detail);
    window.addEventListener("app-confirm", onRequest);
    return () => window.removeEventListener("app-confirm", onRequest);
  }, []);

  const answer = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  useEffect(() => {
    if (!request) return;
    confirmButton.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && answer(false);
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  if (!request) return null;
  const danger = request.tone === "danger";
  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={() => answer(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={request.message ? "confirm-message" : undefined}
        onClick={(event) => event.stopPropagation()}
        className="toast-in w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex gap-4 p-5 sm:p-6">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${danger ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-900"}`}>
            <Icon size={22} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id="confirm-title" className="text-base font-semibold text-slate-900">
              {request.title}
            </h2>
            {request.message ? (
              <p id="confirm-message" className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {request.message}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={() => answer(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100">
            {request.cancelLabel ?? "Annuler"}
          </button>
          <button
            ref={confirmButton}
            type="button"
            onClick={() => answer(true)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-black hover:bg-neutral-800"}`}
          >
            {request.confirmLabel ?? "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
