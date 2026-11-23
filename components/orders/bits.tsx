import { AlertTriangle, Check, Hourglass } from "lucide-react";
import { STAGE_STYLE, hourLabel, isStockComplete, orderStage, stageLabel } from "@/lib/orders/logic";
import type { Order, Slot } from "@/lib/orders/types";

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-neutral-200 md:text-sm";

export function StageBadge({ order }: { order: Order }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_STYLE[orderStage(order)]}`}>
      {stageLabel(order)}
    </span>
  );
}

/** État du stock d'une commande : icône + libellé, jamais la couleur seule. */
export function StockBadge({ order }: { order: Order }) {
  if (order.status !== "active") return null;
  return isStockComplete(order) ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      <Check size={12} strokeWidth={2.5} /> En stock
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
      <Hourglass size={12} strokeWidth={2.2} /> Article en attente
    </span>
  );
}

export function PreparedBadge({ order }: { order: Order }) {
  if (!order.prepared || order.status !== "active") return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
      <Check size={12} strokeWidth={2.5} /> Préparée
    </span>
  );
}

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-slate-900">{icon}</div>
      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

/** Heures proposées pour une livraison : de 7h à 20h30, par demi-heure. */
export const TIME_OPTIONS = Array.from({ length: 28 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** Valeur du sélecteur de moment : "" (journée), "matin", "apres-midi" ou une heure « HH:MM ». */
export const momentOf = (order: Pick<Order, "slot" | "time">) => order.time || order.slot;
export const parseMoment = (value: string): { slot: Slot; time: string } =>
  value.includes(":") ? { slot: "", time: value } : { slot: value as Slot, time: "" };

/** Choix du moment : demi-journée ou heure précise. */
export function MomentSelect({ value, onChange, disabled, className = inputClass }: { value: string; onChange: (value: string) => void; disabled?: boolean; className?: string }) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label="Heure ou demi-journée">
      <optgroup label="Sans heure précise">
        <option value="">Journée</option>
        <option value="matin">Matin</option>
        <option value="apres-midi">Après-midi</option>
      </optgroup>
      <optgroup label="Heure précise">
        {TIME_OPTIONS.map((time) => (
          <option key={time} value={time}>
            {hourLabel(time)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
