"use client";

import { Eraser, Loader2, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Le tracé est enregistré dans un cadre fixe de 600 × 200, quelle que soit la taille de l'écran.
const W = 600;
const H = 200;
type Point = [number, number];

/** Cadre de signature au doigt, à la souris ou au stylet, puis envoi au serveur. */
export default function SignaturePad({ token }: { token: string }) {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const redraw = () => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    for (const stroke of strokes.current) {
      ctx.beginPath();
      stroke.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      // Un simple appui laisse un point visible.
      if (stroke.length === 1) ctx.lineTo(stroke[0][0] + 0.1, stroke[0][1]);
      ctx.stroke();
    }
  };

  useEffect(redraw, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Math.round(n)));
    return [clamp(((event.clientX - box.left) / box.width) * W, W), clamp(((event.clientY - box.top) / box.height) * H, H)];
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    strokes.current.push([point(event)]);
    setEmpty(false);
    setError("");
    redraw();
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const stroke = strokes.current[strokes.current.length - 1];
    const next = point(event);
    const last = stroke[stroke.length - 1];
    if (last[0] === next[0] && last[1] === next[1]) return;
    stroke.push(next);
    redraw();
  };

  const stop = () => {
    drawing.current = false;
  };

  const clear = () => {
    strokes.current = [];
    setEmpty(true);
    setError("");
    redraw();
  };

  const submit = async () => {
    setPending(true);
    setError("");
    try {
      const path = strokes.current.map((stroke) => stroke.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ")).join(" ");
      const response = await fetch(`/api/signer/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, accepted }) });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!result?.ok) {
        setError(result?.error ?? "La signature n'a pas pu être enregistrée. Réessayez.");
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion impossible. Vérifiez votre réseau et réessayez.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-900">Votre signature</span>
        <button type="button" onClick={clear} disabled={empty || pending} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40">
          <Eraser size={14} /> Effacer
        </button>
      </div>
      <div className="relative mt-2 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white">
        <canvas
          ref={canvas}
          width={W}
          height={H}
          aria-label="Cadre de signature"
          className="block aspect-[3/1] w-full cursor-crosshair touch-none select-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
        />
        {empty ? <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">Signez ici avec le doigt ou la souris</span> : null}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-black" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span>J&apos;ai lu mon bon de commande et les conditions générales de vente, et je les accepte.</span>
      </label>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={empty || !accepted || pending}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-40"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />} Signer le bon de commande
      </button>
    </div>
  );
}
