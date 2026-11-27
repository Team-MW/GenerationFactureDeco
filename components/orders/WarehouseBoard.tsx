"use client";

import { Check, Hourglass, Loader2, PackageCheck, Undo2 } from "lucide-react";
import { useState } from "react";
import { setPrepared } from "@/app/commandes/actions";
import { DELIVERY_MODES, dayLabel, isPickup, isStockComplete, shopName, timeLabel } from "@/lib/orders/logic";
import type { Order } from "@/lib/orders/types";
import { Card, buttonPrimary, buttonSecondary } from "../ui";
import { useAction } from "./OrderActions";
import { EmptyState } from "./bits";

function when(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function OrderCard({ order }: { order: Order }) {
  const { pending, run } = useAction();
  const complete = isStockComplete(order);
  const closed = order.status !== "active";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-slate-900">{order.customer.name}</div>
          <div className="tabular text-xs text-slate-500">
            {order.number}
            {order.scheduledDate ? ` · ${timeLabel(order)}` : ""} · {shopName(order.shop)}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${isPickup(order) ? "bg-slate-200 text-slate-800" : "bg-sky-100 text-sky-800"}`}>
          {DELIVERY_MODES[order.delivery.mode].short}
        </span>
      </div>

      <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {order.lines.map((line) => (
          <li key={line.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="tabular grid h-8 min-w-8 place-items-center rounded-md bg-slate-900 px-1.5 text-sm font-semibold text-white">{line.quantity}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{line.name}</span>
              {line.reference ? <span className="tabular text-xs text-slate-500">Réf. {line.reference}</span> : null}
            </span>
            {line.reserved ? null : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                <Hourglass size={12} /> Pas en stock
              </span>
            )}
          </li>
        ))}
      </ul>
      {order.customer.notes ? <p className="mt-2 text-xs text-slate-500">Note : {order.customer.notes}</p> : null}

      {closed ? (
        <p className="mt-3 text-xs text-slate-500">
          {order.status === "cancelled" ? (order.refund ? "Commande remboursée" : "Commande annulée") : isPickup(order) ? "Retirée par le client" : "Livrée"}
          {order.preparedAt ? ` · préparée le ${when(order.preparedAt)}` : ""}
        </p>
      ) : order.prepared ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <Check size={16} strokeWidth={2.5} /> Préparée{order.preparedAt ? ` le ${when(order.preparedAt)}` : ""}
          </span>
          <button type="button" disabled={pending} onClick={() => run(() => setPrepared(order.id, false), "Préparation annulée")} className={buttonSecondary}>
            <Undo2 size={16} /> Annuler
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setPrepared(order.id, true), "Commande préparée")}
          className={`${buttonPrimary} mt-3 w-full justify-center py-3`}
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={18} />}
          {complete ? "Marquer comme préparée" : "Marquer comme préparée (article hors stock)"}
        </button>
      )}
    </Card>
  );
}

export default function WarehouseBoard({ upcoming, undated, history, today }: { upcoming: Order[]; undated: Order[]; history: Order[]; today: string }) {
  const [tab, setTab] = useState<"todo" | "history">("todo");
  const dates = [...new Set(upcoming.map((o) => o.scheduledDate!))].sort();
  const remaining = upcoming.filter((o) => !o.prepared).length + undated.filter((o) => !o.prepared).length;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1 sm:w-96">
        {([["todo", `À préparer (${remaining})`], ["history", `Historique (${history.length})`]] as const).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "todo" ? (
        upcoming.length + undated.length === 0 ? (
          <Card>
            <EmptyState icon={<PackageCheck size={26} strokeWidth={1.6} />} title="Rien à préparer" text="Les commandes apparaîtront ici dès qu'une livraison ou un retrait sera programmé." />
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {dates.map((date) => {
              const list = upcoming.filter((o) => o.scheduledDate === date);
              return (
                <section key={date}>
                  <h2 className={`mb-2 text-sm font-semibold ${date < today ? "text-rose-700" : "text-slate-900"}`}>
                    {date < today ? "En retard · " : ""}
                    {dayLabel(date, today)}
                    <span className="ml-2 font-normal text-slate-500">
                      {list.filter((o) => o.prepared).length}/{list.length} préparée{list.length > 1 ? "s" : ""}
                    </span>
                  </h2>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {list.map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                  </div>
                </section>
              );
            })}
            {undated.length > 0 ? (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-slate-900">
                  Retraits sur place sans date <span className="ml-2 font-normal text-slate-500">le client peut passer à tout moment</span>
                </h2>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  {undated.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )
      ) : history.length === 0 ? (
        <Card>
          <EmptyState icon={<Check size={26} strokeWidth={1.6} />} title="Historique vide" text="Les commandes préparées seront conservées ici." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {history.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </>
  );
}
