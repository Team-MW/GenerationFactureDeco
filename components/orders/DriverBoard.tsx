"use client";

import { Banknote, Check, ChevronLeft, ChevronRight, Loader2, MapPin, Navigation, Phone, Plus, Route, Truck } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { addExtra, collectPayment, completeOrder, locateDeliveries } from "@/app/commandes/actions";
import { toast } from "@/lib/client";
import { eur } from "@/lib/format";
import { DELIVERY_MODES, PAYMENT_METHODS, addDays, dayLabel, fullAddress, isStockComplete, orderBalance, parisDate, sortKey, timeLabel } from "@/lib/orders/logic";
import type { Depot, Order, PaymentMethod } from "@/lib/orders/types";
import { Card, buttonPrimary, buttonSecondary } from "../ui";
import { useAction } from "./OrderActions";
import { EmptyState, inputClass } from "./bits";
import type { MapPoint } from "./RouteMap";

const RouteMap = dynamic(() => import("./RouteMap"), { ssr: false, loading: () => <div className="h-72 w-full animate-pulse bg-slate-100 md:h-full md:min-h-[520px]" /> });

interface Trip {
  /** Identifiants des commandes dans l'ordre de passage. */
  order: string[];
  line: [number, number][];
  distanceKm: number;
  minutes: number;
}

/** Calcule la tournée la plus courte avec le service public OSRM (seules les coordonnées sont envoyées). */
async function computeTrip(depot: Depot | null, stops: Order[]): Promise<Trip | null> {
  const located = stops.filter((o) => o.geo);
  const points = [...(depot ? [{ id: "depot", lat: depot.lat, lon: depot.lon }] : []), ...located.map((o) => ({ id: o.id, lat: o.geo!.lat, lon: o.geo!.lon }))];
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const options = depot ? "source=first&roundtrip=true" : "source=first&destination=last&roundtrip=false";
  const response = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coords}?${options}&overview=full&geometries=geojson`);
  if (!response.ok) return null;
  const data = await response.json();
  const trip = data.trips?.[0];
  if (!trip) return null;
  const ranked = points
    .map((p, i) => ({ id: p.id, rank: data.waypoints[i].waypoint_index as number }))
    .filter((p) => p.id !== "depot")
    .sort((a, b) => a.rank - b.rank);
  return {
    order: ranked.map((p) => p.id),
    line: (trip.geometry.coordinates as [number, number][]).map(([lon, lat]) => [lat, lon]),
    distanceKm: trip.distance / 1000,
    minutes: Math.round(trip.duration / 60),
  };
}

const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

/** Encaissement sur place : reste à payer, règlement reçu, prestation ajoutée. */
function Cashbox({ order }: { order: Order }) {
  const { pending, run } = useAction();
  const balance = orderBalance(order);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("especes");
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const collected = order.payments.filter((p) => p.by === "livreur");
  const value = amount === "" ? balance.rest : num(amount);

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{balance.settled ? "Commande payée" : "À encaisser"}</span>
        <span className={`tabular text-lg font-semibold ${balance.settled ? "text-emerald-700" : "text-slate-900"}`}>{balance.settled ? "0,00 €" : eur(balance.rest)}</span>
      </div>
      <div className="tabular mt-0.5 text-xs text-slate-500">
        Total {eur(balance.total)} · déjà réglé {eur(balance.paid)}
      </div>

      {order.extras.length > 0 ? (
        <ul className="tabular mt-2 flex flex-col gap-1 border-t border-slate-100 pt-2 text-sm text-slate-700">
          {order.extras.map((extra) => (
            <li key={extra.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">+ {extra.label}</span>
              <span className="shrink-0 font-medium">{eur(extra.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {collected.length > 0 ? (
        <ul className="tabular mt-2 flex flex-col gap-1 border-t border-slate-100 pt-2 text-sm text-emerald-800">
          {collected.map((payment, index) => (
            <li key={index} className="flex justify-between gap-3">
              <span>Encaissé · {payment.method ? PAYMENT_METHODS[payment.method] : "—"}</span>
              <span className="font-medium">{eur(payment.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {order.status !== "cancelled" && !balance.settled ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-700">Montant reçu (€)</span>
            <input className={inputClass} inputMode="decimal" placeholder={String(balance.rest).replace(".", ",")} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-700">Mode</span>
            <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(PAYMENT_METHODS).map(([key, text]) => (
                <option key={key} value={key}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending || value <= 0}
            onClick={() =>
              run(async () => {
                const result = await collectPayment(order.id, value, method);
                if (result.ok) setAmount("");
                return result;
              }, `${eur(value)} encaissés`)
            }
            className={`${buttonPrimary} col-span-2 mt-auto h-[42px] justify-center sm:col-span-1 md:h-[38px]`}
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />} Encaisser
          </button>
        </div>
      ) : null}

      {order.status !== "cancelled" ? (
        adding ? (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[2fr_1fr_auto]">
            <label className="col-span-2 sm:col-span-1">
              <span className="mb-1 block text-xs font-medium text-slate-700">Prestation ajoutée sur place</span>
              <input className={inputClass} placeholder="Ex. : montage d'une armoire en plus" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-700">Prix (€)</span>
              <input className={inputClass} inputMode="decimal" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <div className="mt-auto flex gap-2">
              <button
                type="button"
                disabled={pending || !label.trim() || num(price) <= 0}
                onClick={() =>
                  run(async () => {
                    const result = await addExtra(order.id, label, num(price));
                    if (result.ok) {
                      setLabel("");
                      setPrice("");
                      setAdding(false);
                    }
                    return result;
                  }, "Prestation ajoutée au total")
                }
                className={`${buttonPrimary} h-[42px] md:h-[38px]`}
              >
                Ajouter
              </button>
              <button type="button" onClick={() => setAdding(false)} className={`${buttonSecondary} h-[42px] md:h-[38px]`}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
            <Plus size={15} /> Ajouter une prestation non facturée
          </button>
        )
      ) : null}
    </div>
  );
}

function Stop({ order, index }: { order: Order; index: number }) {
  const { pending, run } = useAction();
  const done = order.status === "done";
  const address = fullAddress(order);
  const destination = order.geo ? `${order.geo.lat},${order.geo.lon}` : encodeURIComponent(address);
  return (
    <Card className={`p-4 ${done ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`tabular grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white ${done ? "bg-emerald-600" : "bg-black"}`}>
          {done ? <Check size={18} strokeWidth={2.5} /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="truncate text-base font-semibold text-slate-900">{order.customer.name}</div>
            <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800">{DELIVERY_MODES[order.delivery.mode].short}</span>
          </div>
          <div className="mt-0.5 flex items-start gap-1.5 text-sm text-slate-600">
            <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" /> {address || "Adresse non renseignée"}
          </div>
          <div className="tabular mt-0.5 text-xs text-slate-500">
            {order.number} · {timeLabel(order)}
          </div>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        {order.lines.map((line) => (
          <li key={line.id} className="flex gap-2">
            <span className="tabular font-semibold text-slate-900">{line.quantity} ×</span> {line.name}
          </li>
        ))}
      </ul>
      {order.customer.notes ? <p className="mt-2 text-sm text-slate-600">Note : {order.customer.notes}</p> : null}
      <Cashbox order={order} />
      {!order.geo && address ? <p className="mt-2 text-xs text-amber-800">Adresse non localisée sur la carte : vérifiez-la dans la commande.</p> : null}
      {!order.prepared && !done ? <p className="mt-2 text-xs text-amber-800">Commande pas encore préparée par le magasin.</p> : null}

      {done ? (
        <p className="mt-3 text-sm font-medium text-emerald-700">Livrée</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {order.customer.phone ? (
            <a href={`tel:${order.customer.phone.replace(/\s/g, "")}`} className={`${buttonSecondary} justify-center`}>
              <Phone size={16} /> Appeler
            </a>
          ) : null}
          <a href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&to=${destination}`} target="_blank" rel="noreferrer" className={`${buttonSecondary} justify-center`}>
            <Navigation size={16} /> Itinéraire
          </a>
          <button
            type="button"
            disabled={pending || !isStockComplete(order)}
            onClick={() => {
              if (window.confirm(`Confirmer la livraison chez ${order.customer.name} ?`)) run(() => completeOrder(order.id), "Livraison confirmée");
            }}
            className={`${buttonPrimary} col-span-2 justify-center py-2.5 sm:col-span-1`}
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Livrée
          </button>
        </div>
      )}
    </Card>
  );
}

export default function DriverBoard({ date, today, orders, depot }: { date: string; today: string; orders: Order[]; depot: Depot | null }) {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [busy, setBusy] = useState(false);

  // Coordonnées manquantes : recherchées une fois à l'ouverture de la journée.
  const missing = orders.some((o) => !o.geo && fullAddress(o)) || !depot;
  useEffect(() => {
    if (!missing || orders.length === 0) return;
    let cancelled = false;
    locateDeliveries(date).then(() => !cancelled && router.refresh());
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => setTrip(null), [date]);

  const sorted = useMemo(() => {
    if (trip) {
      const rank = new Map(trip.order.map((id, i) => [id, i]));
      return [...orders].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
    }
    return [...orders].sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.customer.postalCode.localeCompare(b.customer.postalCode));
  }, [orders, trip]);

  const points: MapPoint[] = useMemo(
    () => [
      ...(depot ? [{ lat: depot.lat, lon: depot.lon, label: "D", title: "Dépôt", depot: true }] : []),
      ...sorted.flatMap((o, i) => (o.geo ? [{ lat: o.geo.lat, lon: o.geo.lon, label: String(i + 1), title: `${i + 1}. ${o.customer.name}`, done: o.status === "done" }] : [])),
    ],
    [sorted, depot],
  );

  const optimize = async () => {
    setBusy(true);
    try {
      const result = await computeTrip(depot, orders.filter((o) => o.status === "active"));
      if (result) {
        setTrip(result);
        toast("Tournée optimisée");
      } else {
        toast("Il faut au moins deux points localisés pour tracer un itinéraire.", "info");
      }
    } catch {
      toast("Calcul d'itinéraire indisponible pour le moment.", "error");
    } finally {
      setBusy(false);
    }
  };

  // Caisse de la tournée : ce qu'il reste à encaisser, et ce que le livreur a reçu ce jour-là.
  const cash = useMemo(() => {
    let due = 0, collected = 0, inCash = 0;
    for (const order of orders) {
      if (order.status !== "cancelled") due += orderBalance(order).rest;
      for (const payment of order.payments) {
        if (payment.by !== "livreur" || parisDate(payment.at) !== date) continue;
        collected += payment.amount;
        if (payment.method === "especes") inCash += payment.amount;
      }
    }
    return { due: Math.round(due * 100) / 100, collected: Math.round(collected * 100) / 100, cash: Math.round(inCash * 100) / 100 };
  }, [orders, date]);

  const go = (target: string) => router.push(`/livreur?date=${target}`);
  const remaining = orders.filter((o) => o.status === "active").length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-1">
          <button type="button" aria-label="Jour précédent" onClick={() => go(addDays(date, -1))} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 px-2">
            <div className="truncate text-base font-semibold text-slate-900">{dayLabel(date, today)}</div>
            <div className="text-xs text-slate-500">
              {orders.length === 0 ? "Aucune livraison" : `${remaining} à livrer sur ${orders.length}`}
              {trip ? ` · ${trip.distanceKm.toFixed(0)} km · environ ${Math.floor(trip.minutes / 60)} h ${String(trip.minutes % 60).padStart(2, "0")} de route` : ""}
            </div>
          </div>
          <button type="button" aria-label="Jour suivant" onClick={() => go(addDays(date, 1))} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
            <ChevronRight size={18} />
          </button>
        </div>
        {date !== today ? (
          <button type="button" onClick={() => go(today)} className={buttonSecondary}>
            Aujourd&apos;hui
          </button>
        ) : null}
        <button type="button" onClick={optimize} disabled={busy || orders.length === 0} className={buttonPrimary}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Route size={16} />} Optimiser la tournée
        </button>
      </div>

      {orders.length > 0 ? (
        <Card className="tabular mb-4 grid grid-cols-3 divide-x divide-slate-100 text-center">
          <div className="px-2 py-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Reste à encaisser</div>
            <div className="mt-0.5 text-lg font-semibold text-slate-900">{eur(cash.due)}</div>
          </div>
          <div className="px-2 py-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Encaissé en tournée</div>
            <div className="mt-0.5 text-lg font-semibold text-emerald-700">{eur(cash.collected)}</div>
          </div>
          <div className="px-2 py-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Dont espèces</div>
            <div className="mt-0.5 text-lg font-semibold text-slate-900">{eur(cash.cash)}</div>
          </div>
        </Card>
      ) : null}

      {orders.length === 0 ? (
        <Card>
          <EmptyState icon={<Truck size={26} strokeWidth={1.6} />} title="Aucune livraison ce jour-là" text="Les livraisons programmées dans l'espace livraison apparaissent ici automatiquement." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="overflow-hidden md:sticky md:top-6 md:order-2 md:h-[calc(100dvh-140px)]">
            <RouteMap points={points} route={trip?.line ?? null} />
          </Card>
          <div className="flex flex-col gap-3 md:order-1">
            {sorted.map((order, index) => (
              <Stop key={order.id} order={order} index={index} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
