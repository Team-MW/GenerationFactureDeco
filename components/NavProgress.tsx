"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * Barre de progression fine en haut de l'écran : elle démarre au clic sur un lien
 * et se termine quand la nouvelle page est affichée.
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [progress, setProgress] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Arrivée sur la nouvelle page : on termine la barre.
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    setProgress((value) => (value === null ? null : 100));
    const hide = setTimeout(() => setProgress(null), 250);
    return () => clearTimeout(hide);
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (timer.current) clearInterval(timer.current);
      setProgress(12);
      // Avance vite au début puis ralentit, sans jamais atteindre 100 % avant l'arrivée.
      timer.current = setInterval(() => setProgress((value) => (value === null ? null : value + (92 - value) * 0.12)), 180);
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  if (progress === null) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[2000] h-[3px]" role="progressbar" aria-label="Chargement de la page" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
      <div
        className="h-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.7)] transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${progress}%`, opacity: progress >= 100 ? 0 : 1 }}
      />
    </div>
  );
}

export default function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
