"use client";

import {
  ArrowLeft,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Info,
  PackageCheck,
  Plus,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { ToastKind } from "@/lib/client";

const ICONS: Record<string, LucideIcon> = {
  orders: ClipboardList,
  plus: Plus,
  calendar: CalendarDays,
  stock: Boxes,
  warehouse: PackageCheck,
  truck: Truck,
  chart: BarChart3,
};

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: keyof typeof ICONS;
  /** true = actif uniquement sur l'adresse exacte. */
  exact?: boolean;
}

const TOAST_ICONS = { success: CheckCircle2, error: XCircle, info: Info };
const TOAST_COLORS = { success: "text-emerald-400", error: "text-rose-400", info: "text-sky-400" };

export function Toaster() {
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
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
  return (
    <div className="fixed bottom-24 right-4 z-[1100] flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2 md:bottom-5 md:right-5" aria-live="polite">
      {toasts.map((t) => {
        const Icon = TOAST_ICONS[t.kind];
        return (
          <div key={t.id} className="toast-in flex items-start gap-3 rounded-xl bg-black px-4 py-3 text-sm text-white shadow-lg">
            <Icon size={18} className={`mt-0.5 shrink-0 ${TOAST_COLORS[t.kind]}`} />
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Habillage commun d'un espace : barre latérale noire sur ordinateur, onglets en bas sur téléphone. */
export default function SectionShell({
  companyName,
  section,
  nav,
  children,
}: {
  companyName: string;
  section: string;
  nav: NavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));
  const current = nav.find(isActive);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-black px-4 py-6 md:flex">
        <div className="px-3 pb-8">
          <div className="truncate text-lg font-semibold tracking-tight text-white">{companyName}</div>
          <div className="mt-0.5 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">{section}</div>
        </div>
        <div className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-600">Menu</div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-white text-black" : "text-neutral-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.1 : 1.8} />
                {item.label}
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
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-2 py-2.5 backdrop-blur md:hidden">
          <Link href="/" aria-label="Retour à l'accueil" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-600 active:bg-slate-100">
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight text-slate-900">{companyName}</div>
            <div className="text-[11px] leading-tight text-slate-500">{current?.label ?? section}</div>
          </div>
        </header>
        <main className="mx-auto max-w-[1280px] px-4 pb-28 pt-5 sm:px-8 md:py-8">{children}</main>
      </div>

      {nav.length > 1 ? (
        <nav
          aria-label="Navigation principale"
          className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
        >
          {nav.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium transition active:scale-95 ${
                  active ? "text-brand" : "text-slate-500"
                }`}
              >
                <span className={`grid h-7 w-14 place-items-center rounded-full transition ${active ? "bg-brand-soft" : ""}`}>
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                {item.short}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <Toaster />
    </div>
  );
}
