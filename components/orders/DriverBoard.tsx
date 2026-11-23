"use client";

import { Check, ChevronLeft, ChevronRight, Loader2, MapPin, Navigation, Phone, Route, Truck } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { completeOrder, locateDeliveries } from "@/app/commandes/actions";
import { toast } from "@/lib/client";
import { eur } from "@/lib/format";
import { DELIVERY_MODES, SLOT_LABEL, addDays, dayLabel, fullAddress, isStockComplete, orderBalance } from "@/lib/orders/logic";
import type { Depot, Order } from "@/lib/orders/types";
import { Card, buttonPrimary, buttonSecondary } from "../ui";
import { useAction } from "./OrderActions";
import { EmptyState } from "./bits";
import type { MapPoint } from "./RouteMap";

const RouteMap = dynamic(() => import("./RouteMap"), { ssr: false, loading: () => <div className="h-72 w-full animate-pulse bg-slate-100 md:h-full md:min-h-[520px]" /> });

interface Trip {
  /** Identifiants des commandes dans l'ordre de passage. */
  order: string[];
  line: [number, number][];
  distanceKm: number;
  minutes: number;
}

const SLOT_RANK = { matin: 0, "": 1, "apres-midi": 2 } as const;

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

function Stop({ order, index }: { order: Order; index: number }) {
  const { pending, run } = useAction();
  const done = order.status === "done";
  const balance = orderBalance(order);
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
            {order.number} · {SLOT_LABEL[order.slot]}
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
      <p className={`tabular mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${balance.settled ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
        {balance.settled ? "Commande déjà payée : rien à encaisser" : `À encaisser à la livraison : ${eur(balance.rest)}`}
      </p>
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
    return [...orders].sort((a, b) => SLOT_RANK[a.slot] - SLOT_RANK[b.slot] || a.customer.postalCode.localeCompare(b.customer.postalCode));
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
