"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { dateFr, eur } from "@/lib/format";
import { DELIVERY_MODES, timeLabel, isStockComplete, orderTotals } from "@/lib/orders/logic";
import type { Order } from "@/lib/orders/types";
import { Card } from "../ui";
import { PreparedBadge, StageBadge, StockBadge, inputClass } from "./bits";

type Filter = "en_cours" | "en_stock" | "attente" | "terminees" | "toutes";

const FILTERS: { key: Filter; label: string; test: (o: Order) => boolean }[] = [
  { key: "en_cours", label: "En cours", test: (o) => o.status === "active" },
  { key: "en_stock", label: "En stock", test: (o) => o.status === "active" && isStockComplete(o) },
  { key: "attente", label: "En attente de stock", test: (o) => o.status === "active" && !isStockComplete(o) },
  { key: "terminees", label: "Terminées", test: (o) => o.status !== "active" },
  { key: "toutes", label: "Toutes", test: () => true },
];

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function OrderList({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState<Filter>("en_cours");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = normalize(query.trim());
    const test = FILTERS.find((f) => f.key === filter)!.test;
    return orders
      .filter((o) => test(o) && (!q || normalize(`${o.number} ${o.customer.name} ${o.customer.city} ${o.lines.map((l) => l.name).join(" ")}`).includes(q)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, filter, query]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 md:px-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un client, un numéro, un article…" aria-label="Rechercher une commande" className={`${inputClass} pl-9`} />
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {FILTERS.map((f) => {
            const count = orders.filter(f.test).length;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  active ? "bg-black text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f.label} <span className={active ? "text-neutral-400" : "text-slate-400"}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-14 text-center text-sm text-slate-500">Aucune commande dans cette vue.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((order) => {
            const totals = orderTotals(order);
            return (
              <li key={order.id}>
                <Link href={`/commandes/${order.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-900">{order.customer.name}</span>
                      <span className="tabular shrink-0 text-sm font-semibold text-slate-900">{eur(totals.total)}</span>
                    </div>
                    <div className="tabular mt-0.5 truncate text-xs text-slate-500">
                      {order.number} · {DELIVERY_MODES[order.delivery.mode].short}
                      {order.scheduledDate ? ` · ${dateFr(order.scheduledDate)} (${timeLabel(order).toLowerCase()})` : ""}
                      {" · "}
                      {order.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ")}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <StageBadge order={order} />
                      <StockBadge order={order} />
                      <PreparedBadge order={order} />
                    </div>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-slate-300" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
