"use client";

import { CheckCircle2, FileText, Info, LayoutDashboard, Settings, UploadCloud, XCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast, uploadFiles, type ToastKind } from "@/lib/client";

const NAV = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/factures", label: "Factures", icon: FileText },
  { href: "/import", label: "Import des fichiers", icon: UploadCloud },
  { href: "/parametres", label: "Paramètres", icon: Settings },
];

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const TOAST_ICONS = { success: CheckCircle2, error: XCircle, info: Info };
const TOAST_COLORS = { success: "text-emerald-400", error: "text-rose-400", info: "text-sky-400" };

export default function Shell({ companyName, children }: { companyName: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const version = useRef<string | null>(null);

  // Notifications
  useEffect(() => {
    let nextId = 1;
    const onToast = (event: Event) => {
      const { message, kind } = (event as CustomEvent<{ message: string; kind: ToastKind }>).detail;
      const id = nextId++;
      setToasts((list) => [...list, { id, message, kind }]);
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 5000);
    };
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  // Détection des fichiers déposés directement dans le dossier data/
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch("/api/sync", { cache: "no-store" });
        const data: { version: string } = await response.json();
        if (stopped) return;
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
    const timer = setInterval(check, 4000);
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

  const initials = companyName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-ink px-3 py-5 text-slate-300 md:flex">
        <div className="flex items-center gap-3 px-2 pb-6">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-sm font-semibold text-white">
            {initials || "F"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{companyName}</div>
            <div className="text-xs text-slate-400">Facturation</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                }`}
              >
                <Icon size={17} strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-slate-400">
          <div className="mb-1 flex items-center gap-2 font-medium text-slate-200">
            <UploadCloud size={14} /> Import automatique
          </div>
          Glissez vos fichiers CSV ou Excel n&apos;importe où dans la fenêtre : les factures sont générées aussitôt.
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-slate-600">
              {label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>

      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink/70 p-8 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-white/60 px-16 py-14 text-center text-white">
            <UploadCloud size={44} className="mx-auto mb-4" strokeWidth={1.5} />
            <div className="text-xl font-semibold">Déposez vos fichiers ici</div>
            <div className="mt-1 text-sm text-slate-300">CSV ou Excel · les factures seront générées automatiquement</div>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-5 right-5 z-50 flex w-[340px] max-w-[calc(100vw-40px)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const Icon = TOAST_ICONS[t.kind];
          return (
            <div key={t.id} className="toast-in flex items-start gap-3 rounded-lg bg-ink px-4 py-3 text-sm text-white shadow-lg">
              <Icon size={18} className={`mt-0.5 shrink-0 ${TOAST_COLORS[t.kind]}`} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
