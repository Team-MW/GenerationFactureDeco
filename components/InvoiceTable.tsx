"use client";

import { Archive, ChevronDown, ChevronUp, Download, Eye, FileSpreadsheet, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dateFr, eur, monthLabel } from "@/lib/format";
import type { Invoice } from "@/lib/types";
import { Card, buttonPrimary, buttonSecondary } from "./ui";

type SortKey = "number" | "date" | "client" | "amount" | "net";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "number", label: "Numéro" },
  { key: "date", label: "Date" },
  { key: "client", label: "Client" },
  { key: "amount", label: "Montant TTC", align: "right" },
  { key: "net", label: "Net encaissé", align: "right" },
];

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function InvoiceTable({ invoices, initialMonth }: { invoices: Invoice[]; initialMonth: string }) {
  const months = useMemo(() => [...new Set(invoices.map((i) => i.month))].sort().reverse(), [invoices]);
  const [month, setMonth] = useState(months.includes(initialMonth) ? initialMonth : "");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [preview, setPreview] = useState<Invoice | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setPreview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows = useMemo(() => {
    const q = normalize(query.trim());
    const filtered = invoices.filter(
      (i) =>
        (!month || i.month === month) &&
        (!q || normalize(`${i.client} ${i.number} ${i.ref}`).includes(q)),
    );
    const { key, dir } = sort;
    return filtered.sort((a, b) => {
      const x = a[key];
      const y = b[key];
      const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr");
      return (order || a.number.localeCompare(b.number)) * dir;
    });
  }, [invoices, month, query, sort]);

  const total = rows.reduce((t, i) => t + i.amount, 0);
  const suffix = month ? `?mois=${month}` : "";

  return (
    <>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-3 py-3 md:flex md:flex-wrap md:items-center md:gap-3 md:px-4">
          <div className="relative col-span-2 md:min-w-[220px] md:flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un client, un numéro…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-base outline-none md:text-sm placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-neutral-200"
            />
          </div>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Filtrer par mois"
            className="col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand md:col-span-1"
          >
            <option value="">Tous les mois</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <a href={`/api/factures/export${suffix}`} className={`${buttonSecondary} justify-center`}>
            <FileSpreadsheet size={16} /> Export CSV
          </a>
          <a href={`/api/factures/zip${suffix}`} className={`${buttonPrimary} justify-center`}>
            <Archive size={16} />
            <span className="md:hidden">ZIP</span>
            <span className="hidden md:inline">{month ? `ZIP ${monthLabel(month)}` : "Tout télécharger (ZIP)"}</span>
          </a>
        </div>

        <ul className="divide-y divide-slate-100 md:hidden">
          {rows.map((invoice) => (
            <li key={invoice.id} className="flex items-center gap-2 py-3 pl-4 pr-2 active:bg-slate-50" onClick={() => setPreview(invoice)}>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-slate-900">{invoice.client}</span>
                  <span className="tabular shrink-0 text-sm font-semibold text-slate-900">{eur(invoice.amount)}</span>
                </div>
                <div className="tabular mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="truncate">
                    {invoice.number} · {dateFr(invoice.date)}
                  </span>
                  {invoice.retained > 0 ? (
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">Retenue</span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">Acquittée</span>
                  )}
                </div>
              </div>
              <a
                href={`/api/factures/${invoice.id}/pdf?telecharger`}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Télécharger la facture ${invoice.number}`}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 active:bg-slate-100"
              >
                <Download size={18} />
              </a>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="px-4 py-12 text-center text-sm text-slate-500">Aucune facture ne correspond à votre recherche.</li>
          ) : null}
        </ul>

        <div className="hidden overflow-x-auto md:block">
          <table className="tabular w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                {COLUMNS.map((column) => {
                  const active = sort.key === column.key;
                  const Arrow = sort.dir === 1 ? ChevronUp : ChevronDown;
                  return (
                    <th key={column.key} className={`px-4 py-2.5 font-medium ${column.align === "right" ? "text-right" : "text-left"}`}>
                      <button
                        onClick={() => setSort({ key: column.key, dir: active ? (sort.dir === 1 ? -1 : 1) : 1 })}
                        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900 ${active ? "text-slate-900" : ""}`}
                      >
                        {column.label}
                        <Arrow size={13} className={active ? "" : "opacity-0"} />
                      </button>
                    </th>
                  );
                })}
                <th className="px-4 py-2.5 text-left font-medium">Statut</th>
                <th className="w-24 px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((invoice) => (
                <tr key={invoice.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setPreview(invoice)}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{invoice.number}</td>
                  <td className="px-4 py-2.5 text-slate-600">{dateFr(invoice.date)}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{invoice.client}</div>
                    <div className="text-xs text-slate-400">{invoice.ref}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{eur(invoice.amount)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{eur(invoice.net)}</td>
                  <td className="px-4 py-2.5">
                    {invoice.retained > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Retenue {eur(invoice.retained)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Acquittée
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setPreview(invoice)}
                        title="Aperçu"
                        className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Eye size={16} />
                      </button>
                      <a
                        href={`/api/factures/${invoice.id}/pdf?telecharger`}
                        title="Télécharger le PDF"
                        className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Download size={16} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center text-sm text-slate-500">
                    Aucune facture ne correspond à votre recherche.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="tabular flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          <span>
            {rows.length} facture{rows.length > 1 ? "s" : ""}
          </span>
          <span>
            Total : <span className="font-semibold text-slate-900">{eur(total)}</span>
          </span>
        </div>
      </Card>

      {preview ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-ink/50" onClick={() => setPreview(null)}>
          <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {preview.number} · {preview.client}
                </div>
                <div className="tabular text-xs text-slate-500">
                  {dateFr(preview.date)} · {eur(preview.amount)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/api/factures/${preview.id}/pdf?telecharger`} className={buttonPrimary}>
                  <Download size={16} /> <span className="hidden sm:inline">Télécharger</span>
                </a>
                <button
                  onClick={() => setPreview(null)}
                  aria-label="Fermer"
                  className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <iframe
              key={preview.id}
              src={`/api/factures/${preview.id}/pdf#view=FitH&toolbar=0`}
              title={`Facture ${preview.number}`}
              className="w-full flex-1 bg-slate-100"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
