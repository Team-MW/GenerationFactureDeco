"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Recharge discrètement les données de la page à intervalle régulier, tant que l'onglet est visible.
 * Utile sur les écrans partagés (magasin, livreur, calendrier) : les changements faits par un collègue apparaissent seuls.
 */
export default function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => document.visibilityState === "visible" && router.refresh();
    const timer = setInterval(refresh, seconds * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, seconds]);
  return null;
}
