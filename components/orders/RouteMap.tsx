"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";

export interface MapPoint {
  lat: number;
  lon: number;
  /** Texte affiché dans la pastille : numéro d'étape, ou « D » pour le dépôt. */
  label: string;
  title: string;
  done?: boolean;
  depot?: boolean;
}

/** Carte OpenStreetMap : étapes numérotées et tracé de l'itinéraire. */
export default function RouteMap({ points, route }: { points: MapPoint[]; route: [number, number][] | null }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  // La carte n'est redessinée (et recadrée) que si les points ou le tracé changent vraiment,
  // pas à chaque rafraîchissement automatique de la page.
  const signature = JSON.stringify([points, route?.length ?? 0]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !container.current) return;
      if (!map.current) {
        map.current = L.map(container.current, { zoomControl: true, attributionControl: true }).setView([46.6, 2.4], 6);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map.current);
      }
      const current = map.current;
      current.eachLayer((layer) => {
        if (!(layer instanceof L.TileLayer)) current.removeLayer(layer);
      });
      if (route && route.length > 1) {
        L.polyline(route, { color: "#0a0a0a", weight: 4, opacity: 0.85 }).addTo(current);
      }
      for (const point of points) {
        const background = point.depot ? "#ffffff" : point.done ? "#059669" : "#0a0a0a";
        const color = point.depot ? "#0a0a0a" : "#ffffff";
        const icon = L.divIcon({
          className: "",
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          html: `<div style="width:30px;height:30px;border-radius:9999px;background:${background};color:${color};border:2px solid ${point.depot ? "#0a0a0a" : "#ffffff"};box-shadow:0 1px 4px rgba(0,0,0,.35);display:grid;place-items:center;font:600 13px/1 system-ui,sans-serif">${point.label}</div>`,
        });
        const popup = document.createElement("span");
        popup.textContent = point.title;
        L.marker([point.lat, point.lon], { icon, title: point.title }).addTo(current).bindPopup(popup);
      }
      if (points.length > 0) {
        current.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])), { padding: [36, 36], maxZoom: 14 });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  return <div ref={container} className="h-72 w-full bg-slate-100 md:h-full md:min-h-[520px]" role="application" aria-label="Carte de la tournée" />;
}
