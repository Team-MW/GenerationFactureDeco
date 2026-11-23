"use client";

import { Ban, CalendarClock, Check, Loader2, PackageCheck, Undo2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelOrder, completeOrder, scheduleOrder, setPaid, setPrepared } from "@/app/commandes/actions";
import { eur } from "@/lib/format";
import { toast } from "@/lib/client";
import { isPickup, isStockComplete, orderBalance } from "@/lib/orders/logic";
import type { Order, Result } from "@/lib/orders/types";
import { buttonPrimary, buttonSecondary } from "../ui";
import { MomentSelect, inputClass, momentOf, parseMoment } from "./bits";

/** Lance une action serveur, affiche le résultat et rafraîchit la page. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (action: () => Promise<Result<unknown>>, success?: string) =>
    start(async () => {
      const result = await action();
      if (!result.ok) return void toast(result.error, "error");
      if (success) toast(success);
      router.refresh();
    });
  return { pending, run };
}

/** Sélecteur de date + créneau pour programmer une livraison ou un retrait. */
export function ScheduleControl({ order, compact = false }: { order: Order; compact?: boolean }) {
  const { pending, run } = useAction();
  const [date, setDate] = useState(order.scheduledDate ?? "");
  const [moment, setMoment] = useState(momentOf(order));
  const changed = date !== (order.scheduledDate ?? "") || moment !== momentOf(order);
  const pickup = isPickup(order);
  return (
    <div className={`flex flex-wrap items-end gap-2 ${compact ? "" : "sm:flex-nowrap"}`}>
      <label className="min-w-[140px] flex-1">
        <span className="mb-1 block text-xs font-medium text-slate-700">{pickup ? "Date de retrait" : "Date de livraison"}</span>
        <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="min-w-[120px] flex-1">
        <span className="mb-1 block text-xs font-medium text-slate-700">Heure</span>
        <MomentSelect value={moment} onChange={setMoment} />
      </label>
      <button
        type="button"
        disabled={pending || !date || !changed}
        onClick={() => run(() => scheduleOrder(order.id, date, parseMoment(moment).slot, parseMoment(moment).time), pickup ? "Retrait planifié" : "Livraison programmée")}
        className={`${buttonPrimary} h-[42px] justify-center md:h-[38px]`}
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
        {order.scheduledDate ? "Modifier" : "Programmer"}
      </button>
      {order.scheduledDate ? (
        <button
          type="button"
          disabled={pending}
          title="Retirer la date"
          onClick={() => {
            setDate("");
            run(() => scheduleOrder(order.id, null, ""), "Date retirée");
          }}
          className={`${buttonSecondary} h-[42px] md:h-[38px]`}
        >
          <Undo2 size={16} />
        </button>
      ) : null}
    </div>
  );
}

/** Suivi du règlement : acompte, solde, reste à payer. */
export function PaymentControl({ order }: { order: Order }) {
  const { pending, run } = useAction();
  const balance = orderBalance(order);
  const [amount, setAmount] = useState("");
  const value = Number(amount.replace(",", ".")) || 0;
  return (
    <div>
      <dl className="tabular flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Total TTC</dt>
          <dd className="font-medium text-slate-900">{eur(balance.total)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Déjà réglé</dt>
          <dd className="font-medium text-slate-900">{eur(balance.paid)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-slate-100 pt-2">
          <dt className="font-semibold text-slate-900">Reste à payer</dt>
          <dd className={`text-lg font-semibold ${balance.settled ? "text-emerald-700" : "text-slate-900"}`}>{balance.settled ? "Payé" : eur(balance.rest)}</dd>
        </div>
      </dl>
      {order.status !== "cancelled" && !balance.settled ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <input className={inputClass} inputMode="decimal" placeholder="Montant encaissé (€)" aria-label="Montant encaissé" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button
              type="button"
              disabled={pending || value <= 0}
              onClick={() =>
                run(async () => {
                  const result = await setPaid(order.id, Math.round((balance.paid + value) * 100) / 100);
                  if (result.ok) setAmount("");
                  return result;
                }, "Paiement enregistré")
              }
              className={buttonSecondary}
            >
              <Wallet size={16} /> Ajouter
            </button>
          </div>
          <button type="button" disabled={pending} onClick={() => run(() => setPaid(order.id, balance.total), "Commande réglée")} className={`${buttonPrimary} justify-center`}>
            <Check size={16} /> Marquer payée en totalité
          </button>
        </div>
      ) : null}
      {order.status !== "cancelled" && balance.paid > 0 ? (
        <button type="button" disabled={pending} onClick={() => window.confirm("Remettre le montant réglé à zéro ?") && run(() => setPaid(order.id, 0), "Paiement remis à zéro")} className="mt-2 text-xs font-medium text-slate-500 underline hover:text-slate-900">
          Corriger : remettre à zéro
        </button>
      ) : null}
    </div>
  );
}

export default function OrderActions({ order }: { order: Order }) {
  const { pending, run } = useAction();
  if (order.status !== "active") return null;
  const complete = isStockComplete(order);
  const pickup = isPickup(order);
  return (
    <div className="flex flex-col gap-4">
      <ScheduleControl order={order} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          disabled={pending || (!order.prepared && !complete)}
          onClick={() => run(() => setPrepared(order.id, !order.prepared), order.prepared ? "Préparation annulée" : "Commande marquée préparée")}
          className={`${buttonSecondary} justify-center`}
        >
          <PackageCheck size={16} /> {order.prepared ? "Annuler la préparation" : "Marquer préparée"}
        </button>
        <button
          type="button"
          disabled={pending || !complete}
          onClick={() => run(() => completeOrder(order.id), pickup ? "Commande retirée" : "Commande livrée")}
          className={`${buttonPrimary} justify-center`}
        >
          <Check size={16} /> {pickup ? "Marquer retirée" : "Marquer livrée"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Annuler le bon ${order.number} ?\n\nLes articles réservés seront remis en stock. Cette action est définitive.`)) {
              run(() => cancelOrder(order.id), "Commande annulée");
            }
          }}
          className={`${buttonSecondary} justify-center text-rose-700 hover:bg-rose-50`}
        >
          <Ban size={16} /> Annuler la commande
        </button>
      </div>
      {!complete ? <p className="text-xs text-slate-500">La préparation et la livraison seront possibles dès que tous les articles seront en stock.</p> : null}
    </div>
  );
}
