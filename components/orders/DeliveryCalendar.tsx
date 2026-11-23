"use client";

import { AlertTriangle, BellRing, CalendarDays, Check, ChevronLeft, ChevronRight, GripVertical, Phone, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { scheduleOrder, setReminded } from "@/app/commandes/actions";
import { DELIVERY_MODES, addDays, dayLabel, fullAddress, hourLabel, isPickup, isStockComplete, sortKey, timeLabel } from "@/lib/orders/logic";
import type { Order } from "@/lib/orders/types";
import { Card, CardHeader, buttonPrimary, buttonSecondary } from "../ui";
import { ScheduleControl, useAction } from "./OrderActions";
import { PreparedBadge, StockBadge, inputClass } from "./bits";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/* ───────────────────────── Réglages de la grille horaire ───────────────────────── */

const FIRST_HOUR = 7;
const LAST_HOUR = 21; // dernière ligne : 20h–21h
const HOUR_HEIGHT = 56;
const EVENT_MINUTES = 90; // durée affichée d'une livraison
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeOf = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const topOf = (minutes: number) => ((minutes - FIRST_HOUR * 60) / 60) * HOUR_HEIGHT;

/** Lundi de la semaine qui contient cette date. */
function mondayOf(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** Numéro de semaine ISO. */
function weekNumber(monday: string): number {
  const thursday = new Date(`${addDays(monday, 3)}T12:00:00Z`);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1, 12);
  return Math.ceil(((thursday.getTime() - yearStart) / 86400000 + 1) / 7);
}

/** Heure actuelle à Paris, en minutes depuis minuit. */
function parisMinutes(): number {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
}

function eventStyle(order: Order): string {
  if (order.status === "done") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (!isStockComplete(order)) return "border-amber-300 bg-amber-50 text-amber-900";
  return isPickup(order) ? "border-slate-300 bg-slate-100 text-slate-900" : "border-sky-300 bg-sky-50 text-sky-950";
}

/* ───────────────────────── Éléments communs ───────────────────────── */

function OrderRow({ order, children }: { order: Order; children?: React.ReactNode }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/commandes/${order.id}`} className="min-w-0 hover:underline">
          <div className="truncate text-sm font-medium text-slate-900">{order.customer.name}</div>
          <div className="truncate text-xs text-slate-500">
            {order.number} · {DELIVERY_MODES[order.delivery.mode].short}
            {order.scheduledDate ? ` · ${timeLabel(order)}` : ""}
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

/* ───────────────────────── Vue semaine ───────────────────────── */

interface Placed {
  order: Order;
  start: number;
  lane: number;
  lanes: number;
}

/** Répartit en colonnes les livraisons qui se chevauchent. */
function layout(orders: Order[]): Placed[] {
  const sorted = [...orders].sort((a, b) => a.time.localeCompare(b.time));
  const placed: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...group.map((p) => p.lane + 1));
    for (const p of group) p.lanes = lanes;
    group = [];
  };
  for (const order of sorted) {
    const start = Math.min(Math.max(minutesOf(order.time), FIRST_HOUR * 60), LAST_HOUR * 60 - 30);
    if (start >= groupEnd) close();
    const busy = new Set(group.filter((p) => p.start + EVENT_MINUTES > start).map((p) => p.lane));
    let lane = 0;
    while (busy.has(lane)) lane++;
    const item = { order, start, lane, lanes: 1 };
    group.push(item);
    placed.push(item);
    groupEnd = Math.max(groupEnd, start + EVENT_MINUTES);
  }
  close();
  return placed;
}

function WeekView({
  monday,
  today,
  byDate,
  toSchedule,
  onPick,
  picked,
}: {
  monday: string;
  today: string;
  byDate: Map<string, Order[]>;
  toSchedule: Order[];
  onPick: (order: Order | null) => void;
  picked: Order | null;
}) {
  const { pending, run } = useAction();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const [mobileDay, setMobileDay] = useState(days.includes(today) ? today : monday);
  const [now, setNow] = useState<number | null>(null);
  const [target, setTarget] = useState<{ date: string; time: string } | null>(null);
  const [choice, setChoice] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => setMobileDay(days.includes(today) ? today : monday), [days, today, monday]);

  // Trait de l'heure actuelle, recalé chaque minute.
  useEffect(() => {
    const tick = () => setNow(parisMinutes());
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, []);

  // À l'ouverture, la grille se place sur l'heure du moment (ou le début de journée).
  useEffect(() => {
    if (!scroller.current) return;
    const minutes = days.includes(today) ? parisMinutes() : 8 * 60;
    scroller.current.scrollTop = Math.max(0, topOf(minutes) - 2 * HOUR_HEIGHT);
  }, [days, today]);

  const move = (order: Order, date: string, time: string) =>
    run(() => scheduleOrder(order.id, date, "", time), `${order.customer.name} : ${dayLabel(date, today).split(" · ").pop()} à ${hourLabel(time)}`);

  const dropTime = (event: React.DragEvent<HTMLDivElement>) => {
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
    const minutes = FIRST_HOUR * 60 + Math.round(((y / HOUR_HEIGHT) * 60) / 30) * 30;
    return timeOf(Math.min(Math.max(minutes, FIRST_HOUR * 60), LAST_HOUR * 60 - 30));
  };
  const allOrders = useMemo(() => [...byDate.values()].flat().concat(toSchedule), [byDate, toSchedule]);
  const onDrop = (event: React.DragEvent<HTMLDivElement>, date: string, time: string | null) => {
    event.preventDefault();
    setDragOver(null);
    const order = allOrders.find((o) => o.id === event.dataTransfer.getData("text/order"));
    if (!order || order.status !== "active") return;
    if (time) move(order, date, time);
    else run(() => scheduleOrder(order.id, date, order.scheduledDate === date ? order.slot : "", ""), `${order.customer.name} : ${dayLabel(date, today).split(" · ").pop()}`);
  };

  return (
    <>
      {/* Téléphone : un jour à la fois */}
      <div className="grid grid-cols-7 border-t border-slate-100 md:hidden">
        {days.map((date, i) => {
          const count = (byDate.get(date) ?? []).length;
          const active = date === mobileDay;
          return (
            <button key={date} type="button" aria-pressed={active} onClick={() => setMobileDay(date)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}>
              {DAYS[i]}
              <span className={`tabular grid h-6 w-6 place-items-center rounded-full text-xs ${date === today ? "bg-black text-white" : ""}`}>{Number(date.slice(8))}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${count ? "bg-sky-500" : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>

      {target ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <label className="min-w-[200px] flex-1">
            <span className="mb-1 block text-xs font-medium text-slate-700">
              Programmer le {dayLabel(target.date, today).split(" · ").pop()?.toLowerCase()} à {hourLabel(target.time)}
            </span>
            <select className={inputClass} value={choice} onChange={(e) => setChoice(e.target.value)} autoFocus>
              <option value="">{toSchedule.length ? "Choisir une commande à programmer…" : "Aucune commande à programmer"}</option>
              {toSchedule.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.customer.name} · {o.number} · {DELIVERY_MODES[o.delivery.mode].short}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending || !choice}
            onClick={() => {
              const order = toSchedule.find((o) => o.id === choice);
              if (order) move(order, target.date, target.time);
              setTarget(null);
              setChoice("");
            }}
            className={`${buttonPrimary} h-[42px] md:h-[38px]`}
          >
            <Check size={16} /> Programmer
          </button>
          <button type="button" onClick={() => setTarget(null)} aria-label="Fermer" className={`${buttonSecondary} h-[42px] md:h-[38px]`}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      <div ref={scroller} className="max-h-[640px] overflow-y-auto border-t border-slate-100">
        <div className="grid grid-cols-[44px_1fr] md:grid-cols-[52px_repeat(7,minmax(0,1fr))]">
          {/* En-tête collant : jours + livraisons sans heure précise */}
          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white" />
          {days.map((date, i) => {
            const untimed = (byDate.get(date) ?? []).filter((o) => !o.time).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
            return (
              <div
                key={date}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(`${date}:head`);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onDrop(e, date, null)}
                className={`sticky top-0 z-20 min-w-0 border-b border-l border-slate-200 px-1.5 pb-1.5 pt-2 ${date === mobileDay ? "" : "hidden md:block"} ${dragOver === `${date}:head` ? "bg-sky-50" : date === today ? "bg-slate-50" : "bg-white"}`}
              >
                <div className="hidden items-baseline justify-center gap-1.5 md:flex">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{DAYS[i]}</span>
                  <span className={`tabular grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm font-semibold ${date === today ? "bg-black text-white" : "text-slate-900"}`}>{Number(date.slice(8))}</span>
                </div>
                <div className="mt-1 flex min-h-5 flex-col gap-1">
                  {untimed.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      draggable={o.status === "active"}
                      onDragStart={(e) => e.dataTransfer.setData("text/order", o.id)}
                      onClick={() => onPick(o)}
                      title={`${o.customer.name} · ${timeLabel(o)} (sans heure précise)`}
                      className={`truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-medium ${eventStyle(o)} ${picked?.id === o.id ? "ring-2 ring-black" : ""}`}
                    >
                      {timeLabel(o)} · {o.customer.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Colonne des heures */}
          <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
            {HOURS.map((hour) => (
              <div key={hour} className="tabular absolute right-1.5 -translate-y-1/2 text-[11px] text-slate-400" style={{ top: (hour - FIRST_HOUR) * HOUR_HEIGHT }}>
                {hour > FIRST_HOUR ? `${hour}h` : ""}
              </div>
            ))}
          </div>

          {/* Colonnes des jours */}
          {days.map((date) => {
            const timed = layout((byDate.get(date) ?? []).filter((o) => o.time));
            const showNow = date === today && now !== null && now >= FIRST_HOUR * 60 && now <= LAST_HOUR * 60;
            return (
              <div
                key={date}
                role="button"
                tabIndex={-1}
                aria-label={`Programmer une livraison le ${dayLabel(date, today)}`}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                  const minutes = FIRST_HOUR * 60 + Math.floor(((y / HOUR_HEIGHT) * 60) / 30) * 30;
                  setTarget({ date, time: timeOf(Math.min(minutes, LAST_HOUR * 60 - 30)) });
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(`${date}:${dropTime(e)}`);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onDrop(e, date, dropTime(e))}
                className={`relative min-w-0 cursor-cell border-l border-slate-200 ${date === mobileDay ? "" : "hidden md:block"} ${date === today ? "bg-slate-50/60" : ""}`}
                style={{
                  height: HOURS.length * HOUR_HEIGHT,
                  backgroundImage: "linear-gradient(to bottom, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)",
                  backgroundSize: `100% ${HOUR_HEIGHT}px, 100% ${HOUR_HEIGHT / 2}px`,
                }}
              >
                {dragOver?.startsWith(`${date}:`) && !dragOver.endsWith("head") ? (
                  <div className="pointer-events-none absolute inset-x-0.5 rounded border-2 border-dashed border-sky-500 bg-sky-100/60" style={{ top: topOf(minutesOf(dragOver.slice(11))), height: (EVENT_MINUTES / 60) * HOUR_HEIGHT }}>
                    <span className="tabular px-1 text-[11px] font-semibold text-sky-900">{hourLabel(dragOver.slice(11))}</span>
                  </div>
                ) : null}

                {timed.map(({ order, start, lane, lanes }) => (
                  <button
                    key={order.id}
                    type="button"
                    draggable={order.status === "active"}
                    onDragStart={(e) => e.dataTransfer.setData("text/order", order.id)}
                    onClick={() => onPick(order)}
                    title={`${hourLabel(order.time)} · ${order.customer.name} · ${DELIVERY_MODES[order.delivery.mode].label}`}
                    className={`absolute overflow-hidden rounded-md border px-1.5 py-1 text-left shadow-sm transition hover:z-10 hover:shadow ${eventStyle(order)} ${picked?.id === order.id ? "z-10 ring-2 ring-black" : ""}`}
                    style={{ top: topOf(start) + 1, height: (EVENT_MINUTES / 60) * HOUR_HEIGHT - 3, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                  >
                    <div className="tabular flex items-center gap-1 text-[11px] font-semibold">
                      {hourLabel(order.time)}
                      {order.status === "done" ? <Check size={11} strokeWidth={3} /> : !isStockComplete(order) ? <AlertTriangle size={11} /> : null}
                    </div>
                    <div className={`truncate text-xs font-medium ${order.status === "done" ? "line-through" : ""}`}>{order.customer.name}</div>
                    <div className="truncate text-[11px] opacity-80">
                      {DELIVERY_MODES[order.delivery.mode].short}
                      {!isPickup(order) && order.customer.city ? ` · ${order.customer.city}` : ""}
                    </div>
                  </button>
                ))}

                {showNow ? (
                  <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: topOf(now) }} aria-label="Heure actuelle">
                    <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-rose-500" />
                    <span className="h-0.5 flex-1 bg-rose-500" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Vue mois ───────────────────────── */

function MonthView({ cursor, today, selected, onSelect, byDate }: { cursor: string; today: string; selected: string; onSelect: (date: string) => void; byDate: Map<string, Order[]> }) {
  const [year, month] = cursor.split("-").map(Number);
  const cells = useMemo(() => {
    const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const start = addDays(`${cursor}-01`, -offset);
    return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => addDays(start, i));
  }, [cursor, year, month]);
  return (
    <>
      <div className="grid grid-cols-7 border-t border-slate-100 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {DAYS.map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-t border-slate-100">
        {cells.map((date) => {
          const list = byDate.get(date) ?? [];
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={date === selected}
              aria-label={`${dayLabel(date, today)}, ${list.length} livraison${list.length > 1 ? "s" : ""}`}
              className={`flex min-h-16 flex-col items-stretch gap-1 border-b border-r border-slate-100 p-1.5 text-left transition md:min-h-24 ${date === selected ? "bg-slate-100" : "hover:bg-slate-50"} ${date.startsWith(cursor) ? "" : "opacity-40"}`}
            >
              <span className={`tabular grid h-6 w-6 place-items-center rounded-full text-xs font-medium ${date === today ? "bg-black text-white" : "text-slate-700"}`}>{Number(date.slice(8))}</span>
              {list.length > 0 ? (
                <>
                  <span className="tabular rounded bg-sky-100 px-1 text-center text-[11px] font-semibold text-sky-800 md:hidden">{list.length}</span>
                  <span className="hidden flex-col gap-0.5 md:flex">
                    {list.slice(0, 2).map((o) => (
                      <span key={o.id} className={`truncate rounded border px-1.5 py-0.5 text-[11px] font-medium ${eventStyle(o)}`}>
                        {o.time ? `${hourLabel(o.time)} ` : ""}
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
    </>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function DeliveryCalendar({ orders, today }: { orders: Order[]; today: string }) {
  const [view, setView] = useState<"week" | "month">("week");
  const [monday, setMonday] = useState(mondayOf(today));
  const [cursor, setCursor] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const active = useMemo(() => orders.filter((o) => o.status === "active"), [orders]);
  const byDate = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of orders) {
      if (!order.scheduledDate || order.status === "cancelled") continue;
      map.set(order.scheduledDate, [...(map.get(order.scheduledDate) ?? []), order]);
    }
    return map;
  }, [orders]);
  const picked = orders.find((o) => o.id === pickedId) ?? null;

  const tomorrow = addDays(today, 1);
  const toSchedule = active.filter((o) => !o.scheduledDate && isStockComplete(o));
  const waiting = active.filter((o) => !o.scheduledDate && !isStockComplete(o));
  const late = active.filter((o) => o.scheduledDate && o.scheduledDate < today);
  const toRemind = active.filter((o) => (o.scheduledDate === today || o.scheduledDate === tomorrow) && !o.reminded);
  const blocked = active.filter((o) => o.scheduledDate && o.scheduledDate >= today && !isStockComplete(o));
  const dayOrders = [...(byDate.get(selected) ?? [])].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const sunday = addDays(monday, 6);
  const weekCount = Array.from({ length: 7 }, (_, i) => (byDate.get(addDays(monday, i)) ?? []).length).reduce((a, b) => a + b, 0);
  const [year, month] = cursor.split("-").map(Number);
  const title =
    view === "week"
      ? `Semaine ${weekNumber(monday)} · du ${Number(monday.slice(8))}${monday.slice(5, 7) !== sunday.slice(5, 7) ? ` ${MONTHS[Number(monday.slice(5, 7)) - 1]}` : ""} au ${Number(sunday.slice(8))} ${MONTHS[Number(sunday.slice(5, 7)) - 1]} ${sunday.slice(0, 4)}`
      : `${MONTHS[month - 1][0].toUpperCase()}${MONTHS[month - 1].slice(1)} ${year}`;

  const shift = (delta: number) => {
    if (view === "week") return setMonday(addDays(monday, 7 * delta));
    setCursor(new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7));
  };
  const goToday = () => {
    setMonday(mondayOf(today));
    setCursor(today.slice(0, 7));
    setSelected(today);
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
              {view === "week" ? <p className="text-xs text-slate-500">{weekCount} livraison{weekCount > 1 ? "s" : ""} ou retrait{weekCount > 1 ? "s" : ""} cette semaine</p> : null}
            </div>
            <div className="flex items-center gap-1">
              <div className="mr-1 grid grid-cols-2 rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
                {(["week", "month"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-md px-2.5 py-1.5 transition ${view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>
                    {v === "week" ? "Semaine" : "Mois"}
                  </button>
                ))}
              </div>
              <button type="button" onClick={goToday} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Aujourd&apos;hui
              </button>
              <button type="button" aria-label={view === "week" ? "Semaine précédente" : "Mois précédent"} onClick={() => shift(-1)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">
                <ChevronLeft size={18} />
              </button>
              <button type="button" aria-label={view === "week" ? "Semaine suivante" : "Mois suivant"} onClick={() => shift(1)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {view === "week" ? (
            <WeekView monday={monday} today={today} byDate={byDate} toSchedule={toSchedule} picked={picked} onPick={(o) => setPickedId(o?.id ?? null)} />
          ) : (
            <MonthView cursor={cursor} today={today} selected={selected} onSelect={setSelected} byDate={byDate} />
          )}
        </Card>

        {view === "week" ? (
          picked ? (
            <Card className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/commandes/${picked.id}`} className="text-base font-semibold text-slate-900 hover:underline">
                    {picked.customer.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {picked.number} · {DELIVERY_MODES[picked.delivery.mode].label}
                    {picked.scheduledDate ? ` · ${dayLabel(picked.scheduledDate, today)} · ${timeLabel(picked)}` : ""}
                  </div>
                  {!isPickup(picked) ? <div className="mt-1 text-sm text-slate-600">{fullAddress(picked)}</div> : null}
                  <div className="mt-1 text-sm text-slate-600">{picked.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ")}</div>
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  <StockBadge order={picked} />
                  <PreparedBadge order={picked} />
                  <button type="button" aria-label="Fermer" onClick={() => setPickedId(null)} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100">
                    <X size={16} />
                  </button>
                </div>
              </div>
              {picked.status === "active" ? (
                <div className="mt-4">
                  <ScheduleControl key={`${picked.id}:${picked.scheduledDate}:${picked.time}:${picked.slot}`} order={picked} />
                </div>
              ) : null}
            </Card>
          ) : (
            <p className="flex items-start gap-2 px-1 text-xs text-slate-500">
              <CalendarDays size={14} className="mt-0.5 shrink-0" />
              Cliquez sur un créneau vide pour y programmer une commande, ou faites glisser une commande depuis « À programmer ». Une livraison se déplace en la faisant glisser ; cliquez dessus pour la modifier. Le trait rouge indique l&apos;heure actuelle.
            </p>
          )
        ) : (
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
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Card className="overflow-hidden">
          <CardHeader title="À programmer" hint="Articles en stock, date à fixer" />
          {toSchedule.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Toutes les commandes prêtes ont une date.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
              {toSchedule.map((order) => (
                <li key={order.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/order", order.id)} className="cursor-grab px-4 py-3 active:cursor-grabbing">
                  <div className="flex items-start gap-2">
                    <GripVertical size={16} className="mt-0.5 hidden shrink-0 text-slate-300 md:block" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <Link href={`/commandes/${order.id}`} className="block truncate text-sm font-medium text-slate-900 hover:underline">
                        {order.customer.name}
                      </Link>
                      <div className="truncate text-xs text-slate-500">
                        {order.number} · {DELIVERY_MODES[order.delivery.mode].short}
                        {!isPickup(order) && order.customer.city ? ` · ${order.customer.city}` : ""}
                      </div>
                      <div className="mt-2">
                        <ScheduleControl order={order} compact />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

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
