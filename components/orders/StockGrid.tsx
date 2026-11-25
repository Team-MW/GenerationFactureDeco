"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Loader2, Pencil, Plus, Search, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { importArticles, setArticlePrice, setStock } from "@/app/commandes/actions";
import { toast } from "@/lib/client";
import { eur } from "@/lib/format";
import { parseProducts, productsToCsv, type ProductLine } from "@/lib/orders/csv";
import type { StockRow } from "@/lib/orders/stock";
import type { Result } from "@/lib/orders/types";
import { Card, buttonPrimary, buttonSecondary } from "../ui";
import { useAction } from "./OrderActions";
import { ArticleForm, StockEntry } from "./StockTable";
import { inputClass } from "./bits";

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", "."));

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

/**
 * Valeur modifiable sur place : un clic ouvre le champ, Entrée (ou un clic ailleurs) enregistre, Échap annule.
 * Sert au comptage du stock et à la saisie rapide des prix.
 */
function QuickEdit({ value, label, display, save, done, decimal = false }: { value: number; label: string; display: React.ReactNode; save: (next: number) => Promise<Result<unknown>>; done: string; decimal?: boolean }) {
  const { pending, run } = useAction();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const next = num(draft);
    setDraft(null);
    if (draft.trim() === "" || !Number.isFinite(next) || next < 0 || next === value) return;
    run(() => save(decimal ? next : Math.floor(next)), done);
  };
  if (draft !== null) {
    return (
      <input
        autoFocus
        className={`${inputClass} ml-auto w-24 text-right`}
        inputMode={decimal ? "decimal" : "numeric"}
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
      />
    );
  }
  return (
    <button type="button" disabled={pending} title="Cliquer pour modifier" aria-label={label} onClick={() => setDraft(value > 0 || !decimal ? String(value).replace(".", ",") : "")} className="ml-auto inline-flex min-w-[3rem] items-center justify-end gap-1 rounded-md border border-transparent px-2 py-1 hover:border-slate-300 hover:bg-white">
      {pending ? <Loader2 size={14} className="animate-spin text-slate-400" /> : display}
    </button>
  );
}

/** Import d'un fichier de produits : aperçu de ce qui sera créé ou mis à jour, puis confirmation. */
function ImportPanel({ rows, onClose }: { rows: StockRow[]; onClose: () => void }) {
  const { pending, run } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; lines: ProductLine[]; hasStock: boolean; hasPrice: boolean } | null>(null);
  const [perLine, setPerLine] = useState("1");
  const known = useMemo(() => new Set(rows.filter((r) => r.reference).map((r) => r.reference.toLowerCase())), [rows]);
  const updated = file ? file.lines.filter((l) => l.reference && known.has(l.reference.toLowerCase())).length : 0;

  const read = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      if (picked.size > 2 * 1024 * 1024) throw new Error("Fichier trop volumineux (2 Mo maximum).");
      setFile({ name: picked.name, ...parseProducts(await picked.text()) });
    } catch (error) {
      setFile(null);
      toast(error instanceof Error ? error.message : "Fichier illisible.", "error");
    }
  };

  return (
    <div className="border-b border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" aria-label="Fichier de produits" onChange={(e) => read(e.target.files?.[0])} />
        <button type="button" onClick={() => input.current?.click()} className={buttonSecondary}>
          <Upload size={16} /> {file ? "Choisir un autre fichier" : "Choisir un fichier CSV"}
        </button>
        <p className="min-w-0 flex-1 text-xs text-slate-500">Colonnes reconnues : reference ; nom ; categorie ; dimensions ; coloris ; prix ; stock. Un produit déjà présent (même référence) est mis à jour, jamais créé en double.</p>
      </div>
      {file ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="font-medium text-slate-900">
            {file.name} · {file.lines.length} produit{file.lines.length > 1 ? "s" : ""}
          </div>
          <ul className="mt-1 list-inside list-disc text-slate-600">
            <li>
              {file.lines.length - updated} nouveau{file.lines.length - updated > 1 ? "x" : ""}, {updated} déjà présent{updated > 1 ? "s" : ""} (fiche mise à jour)
            </li>
            <li>{file.hasPrice ? `${file.lines.filter((l) => !l.price).length} sans prix : ils resteront « à définir »` : "Pas de colonne de prix : les prix existants sont conservés"}</li>
            <li>{file.hasStock ? "Quantités lues dans le fichier : elles remplacent le stock disponible" : "Pas de colonne de stock : le stock des produits déjà présents n'est pas modifié"}</li>
          </ul>
          {!file.hasStock && file.lines.length - updated > 0 ? (
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
              Quantité en stock pour chaque nouveau produit
              <input className={`${inputClass} w-20 text-center`} inputMode="numeric" aria-label="Quantité par nouveau produit" value={perLine} onChange={(e) => setPerLine(e.target.value)} />
            </label>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  // Fichier avec une colonne de stock : une case vide vaut 0. Sinon, la quantité choisie ci-dessus.
                  const result = await importArticles(file.lines, file.hasStock ? 0 : Math.max(0, Math.floor(num(perLine)) || 0));
                  if (result.ok) {
                    toast(`${result.data.created} produit${result.data.created > 1 ? "s" : ""} créé${result.data.created > 1 ? "s" : ""}, ${result.data.updated} mis à jour`);
                    onClose();
                  }
                  return result;
                })
              }
              className={buttonPrimary}
            >
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Importer {file.lines.length} produit{file.lines.length > 1 ? "s" : ""}
            </button>
            <button type="button" onClick={onClose} className={buttonSecondary}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Tout le stock dans un seul grand tableau : recherche, filtres, tri, comptage, prix, ajout, import et export. */
export default function StockGrid({ rows }: { rows: StockRow[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [only, setOnly] = useState<Only>("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "category", desc: false });
  const [panel, setPanel] = useState<"" | "create" | "import">("");
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
  const inStock = rows.filter((a) => a.stock > 0).length;
  const toRestock = rows.filter((a) => a.waiting > 0).length;
  const noPrice = rows.filter((a) => a.price === 0).length;
  // Valeur de vente de ce qui est physiquement en magasin (disponible + réservé), hors produits sans prix.
  const value = rows.reduce((t, a) => t + a.price * (a.stock + a.reserved), 0);
  const filters: [Only, string, number][] = [
    ["", "Tout", rows.length],
    ["stock", "En stock", inStock],
    ["rupture", "Rupture", rows.length - inStock],
    ["attente", "À réapprovisionner", toRestock],
    ["prix", "Prix à définir", noPrice],
  ];
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" && key !== "category" }));
  const togglePanel = (next: "create" | "import") => {
    setPanel((current) => (current === next ? "" : next));
    setEditing(null);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([productsToCsv(list)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `Stock ${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Produits" value={String(rows.length)} hint={`${categories.length} catégorie${categories.length > 1 ? "s" : ""}${noPrice ? ` · ${noPrice} sans prix` : ""}`} />
        <Tile label="Pièces disponibles" value={String(units)} hint={`${inStock} produit${inStock > 1 ? "s" : ""} en stock`} />
        <Tile label="Pièces réservées" value={String(reserved)} hint={toRestock ? `${toRestock} produit${toRestock > 1 ? "s" : ""} à réapprovisionner` : "mises de côté pour des commandes"} />
        <Tile label="Valeur du stock" value={eur(value)} hint="au prix de vente, pièces en magasin" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-3 md:px-4">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher : nom, catégorie, coloris, référence…" aria-label="Rechercher dans le stock" className={`${inputClass} pl-9`} />
          </div>
          {categories.length > 0 ? (
            <div className="w-full sm:w-56">
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
          <button type="button" onClick={() => togglePanel("create")} className={buttonPrimary}>
            {panel === "create" ? <X size={16} /> : <Plus size={16} />} {panel === "create" ? "Fermer" : "Ajouter un produit"}
          </button>
          <button type="button" onClick={() => togglePanel("import")} className={buttonSecondary}>
            {panel === "import" ? <X size={16} /> : <Upload size={16} />} {panel === "import" ? "Fermer" : "Importer"}
          </button>
          <button type="button" onClick={download} disabled={list.length === 0} className={buttonSecondary} title="Télécharger les lignes affichées (CSV, lisible par Excel)">
            <Download size={16} /> Exporter
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
        {panel === "create" ? <ArticleForm categories={categories} onClose={() => setPanel("")} /> : null}
        {panel === "import" ? <ImportPanel rows={rows} onClose={() => setPanel("")} /> : null}

        {list.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-slate-500">{rows.length === 0 ? "Aucun produit pour l'instant. Ajoutez-en un, ou importez votre fichier de produits." : "Aucun produit ne correspond."}</p>
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
                              setPanel("");
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
                      <td className="tabular whitespace-nowrap px-3 py-1.5">
                        <div className="flex">
                          <QuickEdit
                            decimal
                            value={article.price}
                            label={`Prix de ${article.name}`}
                            done="Prix enregistré"
                            save={(next) => setArticlePrice(article.id, next)}
                            display={article.price > 0 ? <span className="font-semibold text-slate-900">{eur(article.price)}</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">À définir</span>}
                          />
                        </div>
                      </td>
                      <td className="tabular px-3 py-1.5">
                        <div className="flex">
                          <QuickEdit
                            value={article.stock}
                            label={`Quantité disponible de ${article.name}`}
                            done="Stock mis à jour"
                            save={(next) => setStock(article.id, next)}
                            display={<span className={`text-base font-semibold ${article.stock === 0 ? "text-slate-400" : "text-slate-900"}`}>{article.stock}</span>}
                          />
                        </div>
                      </td>
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
