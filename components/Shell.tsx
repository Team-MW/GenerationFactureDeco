"use client";

import { ArrowLeft, FileText, FlaskConical, LayoutDashboard, Settings, UploadCloud } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast, uploadFiles } from "@/lib/client";

const NAV = [
  { href: "/lenbox", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard },
  { href: "/lenbox/factures", label: "Factures", short: "Factures", icon: FileText },
  { href: "/lenbox/import", label: "Import des fichiers", short: "Import", icon: UploadCloud },
  { href: "/parametres", label: "Paramètres", short: "Réglages", icon: Settings },
];


export default function Shell({ companyName, testMode = false, children }: { companyName: string; testMode?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  // Le centre est la seule zone qui défile : on la remet en haut à chaque changement de page.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const version = useRef<string | null>(null);


  // Détection des fichiers déposés directement dans le dossier data/
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch("/api/sync", { cache: "no-store" });
        const data: { version: string } = await response.json();
        if (stopped) return;
        if (!data.version) return;
        if (version.current !== null && version.current !== data.version) {
          toast("Dossier mis à jour · factures actualisées", "info");
          router.refresh();
        }
        version.current = data.version;
      } catch {
        // serveur momentanément indisponible
      }
    };
    void check();
    const timer = setInterval(check, 10000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [router]);

  // Glisser-déposer sur toute la fenêtre
  useEffect(() => {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = async (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const imported = await uploadFiles([...(event.dataTransfer?.files ?? [])]);
      if (imported) {
        // la mise à jour vient de nous : pas de seconde notification
        version.current = null;
        router.refresh();
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [router]);

  return (
    <div className="flex h-full">
      <aside className="hidden h-full w-64 shrink-0 flex-col overflow-y-auto bg-black px-4 py-6 md:flex">
        <div className="px-3 pb-8">
          <div className="truncate text-lg font-semibold tracking-tight text-white">{companyName}</div>
          <div className="mt-0.5 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">Gestion Lenbox</div>
        </div>
        <div className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-600">Menu</div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/lenbox" ? pathname === "/lenbox" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-white text-black" : "text-neutral-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.1 : 1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/"
          className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={18} strokeWidth={1.8} />
          Retour à l&apos;accueil
        </Link>
        <div className="mt-3 border-t border-white/10 px-3 pt-5">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Import automatique
          </div>
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">
            Glissez vos fichiers CSV ou Excel dans la fenêtre : les factures sont générées aussitôt.
          </p>
        </div>
      </aside>

      <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-2 py-2.5 backdrop-blur md:hidden">
          <Link href="/" aria-label="Retour à l'accueil" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-600 active:bg-slate-100">
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight text-slate-900">{companyName}</div>
            <div className="text-[11px] leading-tight text-slate-500">
              {NAV.find((n) => (n.href === "/lenbox" ? pathname === "/lenbox" : pathname.startsWith(n.href)))?.label ?? "Gestion Lenbox"}
            </div>
          </div>
        </header>
        {testMode ? (
          <div className="flex items-start gap-2 border-b border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 sm:px-8">
            <FlaskConical size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <span>
              Le mode test ne concerne que les commandes. <strong className="font-semibold text-slate-900">Les factures Lenbox affichées ici sont vos vraies données</strong> : un import ou un retrait de fichier est bien réel.
            </span>
          </div>
        ) : null}
        <main className="mx-auto max-w-[1280px] px-4 pb-28 pt-5 sm:px-8 md:py-8">{children}</main>
      </div>

      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.map(({ href, short, icon: Icon }) => {
          const active = href === "/lenbox" ? pathname === "/lenbox" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium transition active:scale-95 ${
                active ? "text-brand" : "text-slate-500"
              }`}
            >
              <span className={`grid h-7 w-14 place-items-center rounded-full transition ${active ? "bg-brand-soft" : ""}`}>
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              </span>
              {short}
            </Link>
          );
        })}
      </nav>

      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/75 p-8 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-white/60 px-16 py-14 text-center text-white">
            <UploadCloud size={44} className="mx-auto mb-4" strokeWidth={1.5} />
            <div className="text-xl font-semibold">Déposez vos fichiers ici</div>
            <div className="mt-1 text-sm text-slate-300">CSV ou Excel · les factures seront générées automatiquement</div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
