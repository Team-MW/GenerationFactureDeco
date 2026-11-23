"use client";

import { BellRing, ChevronLeft, ChevronRight, Phone } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { setReminded } from "@/app/commandes/actions";
import { DELIVERY_MODES, SLOT_LABEL, addDays, dayLabel, fullAddress, isPickup, isStockComplete } from "@/lib/orders/logic";
import type { Order } from "@/lib/orders/types";
import { Card, CardHeader } from "../ui";
import { ScheduleControl, useAction } from "./OrderActions";
import { PreparedBadge, StockBadge } from "./bits";

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function OrderRow({ order, children }: { order: Order; children?: React.ReactNode }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/commandes/${order.id}`} className="min-w-0 hover:underline">
          <div className="truncate text-sm font-medium text-slate-900">{order.customer.name}</div>
          <div className="truncate text-xs text-slate-500">
            {order.number} · {DELIVERY_MODES[order.delivery.mode].short}
            {order.scheduledDate ? ` · ${SLOT_LABEL[order.slot]}` : ""}
            {!isPickup(order) && order.customer.city ? ` · ${order.customer.city}` : ""}
          </div>
        </Link>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <StockBadge order={order} />
          <PreparedBadge order={order} />
        </div>
      </div>
      {children}
    </li>
  );
}

function ReminderRow({ order }: { order: Order }) {
  const { pending, run } = useAction();
  return (
    <OrderRow order={order}>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {order.customer.phone ? (
          <a href={`tel:${order.customer.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Phone size={13} /> {order.customer.phone}
          </a>
        ) : (
          <span className="text-xs text-slate-400">Pas de téléphone</span>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-black" checked={order.reminded} disabled={pending} onChange={(e) => run(() => setReminded(order.id, e.target.checked), e.target.checked ? "Client prévenu" : undefined)} />
          Client prévenu
        </label>
      </div>
    </OrderRow>
  );
}

export default function DeliveryCalendar({ orders, today }: { orders: Order[]; today: string }) {
  const [cursor, setCursor] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);

  const active = useMemo(() => orders.filter((o) => o.status === "active"), [orders]);
  const byDate = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of orders) {
      if (!order.scheduledDate || order.status === "cancelled") continue;
      map.set(order.scheduledDate, [...(map.get(order.scheduledDate) ?? []), order]);
    }
    return map;
  }, [orders]);

  const [year, month] = cursor.split("-").map(Number);
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const start = addDays(`${cursor}-01`, -offset);
    const total = Math.ceil((offset + count) / 7) * 7;
    return Array.from({ length: total }, (_, i) => addDays(start, i));
  }, [cursor, year, month]);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setCursor(d.toISOString().slice(0, 7));
  };

  const tomorrow = addDays(today, 1);
  const toSchedule = active.filter((o) => !o.scheduledDate && isStockComplete(o));
  const waiting = active.filter((o) => !o.scheduledDate && !isStockComplete(o));
  const late = active.filter((o) => o.scheduledDate && o.scheduledDate < today);
  const toRemind = active.filter((o) => (o.scheduledDate === today || o.scheduledDate === tomorrow) && !o.reminded);
  const blocked = active.filter((o) => o.scheduledDate && o.scheduledDate >= today && !isStockComplete(o));
  const dayOrders = (byDate.get(selected) ?? []).sort((a, b) => a.slot.localeCompare(b.slot));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="flex flex-col gap-4 xl:col-span-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {MONTHS[month - 1]} {year}
            </h2>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { setCursor(today.slice(0, 7)); setSelected(today); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Aujourd&apos;hui
              </button>
              <button type="button" aria-label="Mois précédent" onClick={() => shift(-1)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">
                <ChevronLeft size={18} />
              </button>
              <button type="button" aria-label="Mois suivant" onClick={() => shift(1)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 border-t border-slate-100 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {DAYS.map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 border-t border-slate-100">
            {cells.map((date) => {
              const list = byDate.get(date) ?? [];
              const inMonth = date.startsWith(cursor);
              const isSelected = date === selected;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelected(date)}
                  aria-pressed={isSelected}
                  aria-label={`${dayLabel(date, today)}, ${list.length} livraison${list.length > 1 ? "s" : ""}`}
                  className={`flex min-h-16 flex-col items-stretch gap-1 border-b border-r border-slate-100 p-1.5 text-left transition md:min-h-24 ${
                    isSelected ? "bg-slate-100" : "hover:bg-slate-50"
                  } ${inMonth ? "" : "opacity-40"}`}
                >
                  <span className={`tabular grid h-6 w-6 place-items-center rounded-full text-xs font-medium ${date === today ? "bg-black text-white" : "text-slate-700"}`}>
                    {Number(date.slice(8))}
                  </span>
                  {list.length > 0 ? (
                    <>
                      <span className="tabular rounded bg-sky-100 px-1 text-center text-[11px] font-semibold text-sky-800 md:hidden">{list.length}</span>
                      <span className="hidden flex-col gap-0.5 md:flex">
                        {list.slice(0, 2).map((o) => (
                          <span key={o.id} className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${o.status === "done" ? "bg-emerald-50 text-emerald-700 line-through" : isPickup(o) ? "bg-slate-200 text-slate-700" : "bg-sky-100 text-sky-800"}`}>
                            {o.customer.name}
                          </span>
                        ))}
                        {list.length > 2 ? <span className="px-1.5 text-[11px] text-slate-500">+ {list.length - 2} autres</span> : null}
                      </span>
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title={dayLabel(selected, today)} hint={`${dayOrders.length} livraison${dayOrders.length > 1 ? "s" : ""} ou retrait${dayOrders.length > 1 ? "s" : ""}`} />
          {dayOrders.length === 0 ? (
            <p className="px-4 py-8 text-sm text-slate-500">Rien de prévu ce jour-là.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
              {dayOrders.map((order) => (
                <OrderRow key={order.id} order={order}>
                  {!isPickup(order) ? <div className="mt-1 text-xs text-slate-500">{fullAddress(order)}</div> : null}
                </OrderRow>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card className="overflow-hidden">
          <CardHeader title="Rappels" hint="Clients à prévenir pour aujourd'hui et demain" />
          {toRemind.length + late.length + blocked.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Aucun rappel en attente.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
              {late.map((order) => (
                <OrderRow key={`late-${order.id}`} order={order}>
                  <p className="mt-1 text-xs font-medium text-rose-700">En retard : prévue le {order.scheduledDate!.split("-").reverse().join("/")}, toujours pas clôturée.</p>
                </OrderRow>
              ))}
              {blocked.map((order) => (
                <OrderRow key={`blocked-${order.id}`} order={order}>
                  <p className="mt-1 text-xs font-medium text-amber-800">Programmée mais un article manque encore en stock.</p>
                </OrderRow>
              ))}
              {toRemind.map((order) => (
                <ReminderRow key={`remind-${order.id}`} order={order} />
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="À programmer" hint="Articles en stock, date à fixer" />
          {toSchedule.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Toutes les commandes prêtes ont une date.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
              {toSchedule.map((order) => (
                <OrderRow key={order.id} order={order}>
                  <div className="mt-2">
                    <ScheduleControl order={order} compact />
                  </div>
                </OrderRow>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="En attente de stock" hint="Passeront « à programmer » à l'arrivée des articles" />
          {waiting.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Aucune commande en attente.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
              {waiting.map((order) => (
                <OrderRow key={order.id} order={order}>
                  <p className="mt-1 text-xs text-slate-500">
                    Manque : {order.lines.filter((l) => !l.reserved).map((l) => `${l.quantity} × ${l.name}`).join(", ")}
                  </p>
                </OrderRow>
              ))}
            </ul>
          )}
        </Card>

        <p className="flex items-start gap-2 px-1 text-xs text-slate-500">
          <BellRing size={14} className="mt-0.5 shrink-0" />
          Les rappels s&apos;affichent ici la veille et le jour même. Cochez « Client prévenu » une fois l&apos;appel passé.
        </p>
      </div>
    </div>
  );
}
