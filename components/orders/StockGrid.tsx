"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { eur } from "@/lib/format";
import type { StockRow } from "@/lib/orders/stock";
import { Card, buttonPrimary } from "../ui";
import { ArticleForm, StockEntry } from "./StockTable";
import { inputClass } from "./bits";

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type SortKey = "name" | "category" | "price" | "stock" | "reserved" | "waiting";
type Only = "" | "stock" | "rupture" | "attente" | "prix";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Produit" },
  { key: "category", label: "Catégorie" },
  { key: "price", label: "Prix TTC", numeric: true },
  { key: "stock", label: "Disponible", numeric: true },
  { key: "reserved", label: "Réservé", numeric: true },
  { key: "waiting", label: "En attente", numeric: true },
];

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </Card>
  );
}

/** Tout le stock dans un seul grand tableau : recherche, filtres, tri par colonne, ajout et modification de produits. */
export default function StockGrid({ rows }: { rows: StockRow[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [only, setOnly] = useState<Only>("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "category", desc: false });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(rows.map((a) => a.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [rows]);
  const list = useMemo(() => {
    // Chaque mot saisi doit se retrouver dans le nom, la catégorie, les dimensions, le coloris ou la référence.
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const filtered = rows
      .filter((a) => !category || a.category === category)
      .filter((a) => (only === "stock" ? a.stock > 0 : only === "rupture" ? a.stock === 0 : only === "attente" ? a.waiting > 0 : only === "prix" ? a.price === 0 : true))
      .filter((a) => {
        const text = normalize(`${a.name} ${a.category} ${a.dimensions} ${a.color} ${a.reference}`);
        return words.every((w) => text.includes(w));
      });
    const byName = (a: StockRow, b: StockRow) => a.name.localeCompare(b.name, "fr") || a.dimensions.localeCompare(b.dimensions, "fr", { numeric: true }) || a.color.localeCompare(b.color, "fr");
    const compare = (a: StockRow, b: StockRow) => {
      if (sort.key === "name") return byName(a, b);
      if (sort.key === "category") return a.category.localeCompare(b.category, "fr") || byName(a, b);
      return a[sort.key] - b[sort.key] || byName(a, b);
    };
    return filtered.sort((a, b) => (sort.desc ? -compare(a, b) : compare(a, b)));
  }, [rows, query, category, only, sort]);

  const units = rows.reduce((t, a) => t + a.stock, 0);
  const reserved = rows.reduce((t, a) => t + a.reserved, 0);
  const toRestock = rows.filter((a) => a.waiting > 0).length;
  const noPrice = rows.filter((a) => a.price === 0).length;
  const filters: [Only, string, number][] = [
    ["", "Tout", rows.length],
    ["stock", "En stock", rows.filter((a) => a.stock > 0).length],
    ["rupture", "Rupture", rows.filter((a) => a.stock === 0).length],
    ["attente", "À réapprovisionner", toRestock],
    ["prix", "Prix à définir", noPrice],
  ];
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" && key !== "category" }));

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Produits" value={String(rows.length)} hint={`${categories.length} catégorie${categories.length > 1 ? "s" : ""}`} />
        <Tile label="Pièces disponibles" value={String(units)} hint={`${rows.filter((a) => a.stock > 0).length} produit${rows.filter((a) => a.stock > 0).length > 1 ? "s" : ""} en stock`} />
        <Tile label="Pièces réservées" value={String(reserved)} hint="mises de côté pour des commandes" />
        <Tile label="À réapprovisionner" value={String(toRestock)} hint={noPrice ? `${noPrice} produit${noPrice > 1 ? "s" : ""} sans prix` : "attendus par des clients"} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-3 md:px-4">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher : nom, catégorie, coloris, référence…" aria-label="Rechercher dans le stock" className={`${inputClass} pl-9`} />
          </div>
          {categories.length > 0 ? (
            <div className="w-full sm:w-60">
              <select className={inputClass} aria-label="Filtrer par catégorie" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Toutes les catégories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c} ({rows.filter((a) => a.category === c).length})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setCreating((v) => !v);
              setEditing(null);
            }}
            className={buttonPrimary}
          >
            {creating ? <X size={16} /> : <Plus size={16} />} {creating ? "Fermer" : "Ajouter un produit"}
          </button>
          <div className="flex w-full flex-wrap items-center gap-2">
            {filters.map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                aria-pressed={only === key}
                onClick={() => setOnly(key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${only === key ? "border-black bg-black text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}
              >
                {label} <span className={`tabular ${only === key ? "text-white/70" : "text-slate-400"}`}>{count}</span>
              </button>
            ))}
            <span className="tabular ml-auto text-xs text-slate-500">
              {list.length} ligne{list.length > 1 ? "s" : ""} affichée{list.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>
        {creating ? <ArticleForm categories={categories} onClose={() => setCreating(false)} /> : null}

        {list.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-slate-500">{rows.length === 0 ? "Aucun produit pour l'instant. Cliquez sur « Ajouter un produit »." : "Aucun produit ne correspond."}</p>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 shadow-[0_1px_0_#e2e8f0]">
                <tr>
                  {COLUMNS.map((column) => (
                    <th key={column.key} scope="col" aria-sort={sort.key === column.key ? (sort.desc ? "descending" : "ascending") : "none"} className={`px-3 py-2.5 font-medium ${column.numeric ? "text-right" : ""}`}>
                      <button type="button" onClick={() => toggleSort(column.key)} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900 ${sort.key === column.key ? "text-slate-900" : ""}`}>
                        {column.label}
                        {sort.key === column.key ? sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} /> : <ChevronsUpDown size={12} className="text-slate-300" />}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Entrée / sortie
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((article) =>
                  editing === article.id ? (
                    <tr key={article.id}>
                      <td colSpan={COLUMNS.length + 1} className="p-0">
                        <ArticleForm article={article} categories={categories} onClose={() => setEditing(null)} />
                      </td>
                    </tr>
                  ) : (
                    <tr key={article.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-900">{article.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(article.id);
                              setCreating(false);
                            }}
                            aria-label={`Modifier ${article.name}`}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                        {article.dimensions || article.color ? <div className="text-xs text-slate-600">{[article.dimensions, article.color].filter(Boolean).join(" · ")}</div> : null}
                        {article.reference ? <div className="tabular max-w-[340px] truncate text-[11px] text-slate-400">{article.reference}</div> : null}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{article.category || <span className="text-slate-400">—</span>}</td>
                      <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">
                        {article.price > 0 ? <span className="font-semibold text-slate-900">{eur(article.price)}</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">À définir</span>}
                      </td>
                      <td className={`tabular px-3 py-2.5 text-right text-base font-semibold ${article.stock === 0 ? "text-slate-400" : "text-slate-900"}`}>{article.stock}</td>
                      <td className={`tabular px-3 py-2.5 text-right text-base font-semibold ${article.reserved === 0 ? "text-slate-400" : "text-slate-900"}`}>{article.reserved}</td>
                      <td className={`tabular px-3 py-2.5 text-right text-base font-semibold ${article.waiting ? "text-amber-700" : "text-slate-400"}`}>{article.waiting}</td>
                      <td className="px-3 py-2">
                        <StockEntry article={article} />
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
