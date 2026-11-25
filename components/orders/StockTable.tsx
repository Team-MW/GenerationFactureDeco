"use client";

import { Check, Hourglass, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { adjustStock, createArticle, updateArticle } from "@/app/commandes/actions";
import { eur } from "@/lib/format";
import { articleDetails } from "@/lib/orders/logic";
import type { Article } from "@/lib/orders/types";
import { Card, buttonPrimary, buttonSecondary } from "../ui";
import { useAction } from "./OrderActions";
import { inputClass } from "./bits";

export interface StockRow extends Article {
  /** Quantité mise de côté pour des commandes en cours. */
  reserved: number;
  /** Quantité commandée par des clients mais pas encore en stock. */
  waiting: number;
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

function ArticleForm({ article, categories, onClose }: { article?: Article; categories: string[]; onClose: () => void }) {
  const { pending, run } = useAction();
  const [name, setName] = useState(article?.name ?? "");
  const [reference, setReference] = useState(article?.reference ?? "");
  const [category, setCategory] = useState(article?.category ?? "");
  const [dimensions, setDimensions] = useState(article?.dimensions ?? "");
  const [color, setColor] = useState(article?.color ?? "");
  const [price, setPrice] = useState(article && article.price > 0 ? String(article.price) : "");
  const [stock, setStock] = useState("0");
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(
      async () => {
        const result = article
          ? await updateArticle(article.id, { name, reference, category, dimensions, color, price: num(price) })
          : await createArticle({ name, reference, category, dimensions, color, price: num(price), stock: Math.floor(num(stock)) });
        if (result.ok) onClose();
        return result;
      },
      article ? "Produit modifié" : "Produit ajouté à l'inventaire",
    );
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50 p-4 sm:grid-cols-6">
      <label className="col-span-2 sm:col-span-3">
        <span className="mb-1 block text-xs font-medium text-slate-700">Nom du produit</span>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </label>
      <label className="col-span-2 sm:col-span-3">
        <span className="mb-1 block text-xs font-medium text-slate-700">Catégorie</span>
        <input className={inputClass} list="categories-inventaire" placeholder="Ex. : Canapés" value={category} onChange={(e) => setCategory(e.target.value)} />
        <datalist id="categories-inventaire">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="col-span-2 sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-slate-700">Dimensions / configuration</span>
        <input className={inputClass} placeholder="Ex. : 300 × 200 cm" value={dimensions} onChange={(e) => setDimensions(e.target.value)} />
      </label>
      <label className="col-span-2 sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-slate-700">Coloris</span>
        <input className={inputClass} value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      <label className="col-span-2 sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-slate-700">Référence</span>
        <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-700">Prix TTC (€)</span>
        <input className={inputClass} inputMode="decimal" placeholder="À définir" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      {article ? null : (
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-700">Stock initial</span>
          <input className={inputClass} inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} />
        </label>
      )}
      <div className="col-span-2 flex gap-2 sm:col-span-6">
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {article ? "Enregistrer" : "Ajouter le produit"}
        </button>
        <button type="button" onClick={onClose} className={buttonSecondary}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function StockEntry({ article }: { article: StockRow }) {
  const { pending, run } = useAction();
  const [quantity, setQuantity] = useState("");
  const apply = (sign: 1 | -1) => {
    const value = Math.floor(num(quantity));
    if (value <= 0) return;
    run(
      async () => {
        const result = await adjustStock(article.id, sign * value);
        if (result.ok) setQuantity("");
        return result;
      },
      sign > 0 ? `${value} ajouté${value > 1 ? "s" : ""} au stock` : `${value} retiré${value > 1 ? "s" : ""} du stock`,
    );
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        className={`${inputClass} w-20 text-center`}
        inputMode="numeric"
        placeholder="Qté"
        aria-label={`Quantité à ajouter ou retirer pour ${article.name}`}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply(1)}
      />
      <button type="button" disabled={pending || !quantity} onClick={() => apply(1)} className={`${buttonPrimary} px-3`} title="Entrée de stock">
        <Plus size={16} /> <span className="hidden lg:inline">Entrée</span>
      </button>
      <button type="button" disabled={pending || !quantity} onClick={() => apply(-1)} className={`${buttonSecondary} px-3`} title="Sortie / correction" aria-label={`Retirer du stock de ${article.name}`}>
        −
      </button>
    </div>
  );
}

export default function StockTable({ rows }: { rows: StockRow[] }) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [only, setOnly] = useState<"" | "stock" | "rupture" | "prix">("");

  const categories = useMemo(() => [...new Set(rows.map((a) => a.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [rows]);
  const list = useMemo(() => {
    // Chaque mot saisi doit se retrouver dans le nom, la catégorie, les dimensions, le coloris ou la référence.
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    return rows
      .filter((a) => !category || a.category === category)
      .filter((a) => (only === "stock" ? a.stock > 0 : only === "rupture" ? a.stock === 0 : only === "prix" ? a.price === 0 : true))
      .filter((a) => {
        const text = normalize(`${a.name} ${a.category} ${a.dimensions} ${a.color} ${a.reference}`);
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => Number(b.waiting > 0) - Number(a.waiting > 0) || a.category.localeCompare(b.category, "fr") || a.name.localeCompare(b.name, "fr") || a.dimensions.localeCompare(b.dimensions, "fr", { numeric: true }));
  }, [rows, query, category, only]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-3 md:px-4">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher : nom, catégorie, coloris, référence…" aria-label="Rechercher un produit" className={`${inputClass} pl-9`} />
        </div>
        <button type="button" onClick={() => setCreating((v) => !v)} className={buttonPrimary}>
          {creating ? <X size={16} /> : <Plus size={16} />} {creating ? "Fermer" : "Ajouter un produit"}
        </button>
        <div className="flex w-full flex-wrap items-center gap-2">
          {categories.length > 0 ? (
            <div className="w-full sm:w-64">
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
          {(
            [
              ["", "Tout"],
              ["stock", "En stock"],
              ["rupture", "Rupture"],
              ["prix", "Prix à définir"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={only === key}
              onClick={() => setOnly(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${only === key ? "border-black bg-black text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}
            >
              {label}
            </button>
          ))}
          <span className="tabular ml-auto text-xs text-slate-500">
            {list.length} produit{list.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>
      {creating ? <ArticleForm categories={categories} onClose={() => setCreating(false)} /> : null}

      {list.length === 0 ? (
        <p className="px-4 py-14 text-center text-sm text-slate-500">
          {rows.length === 0 ? "Inventaire vide. Ajoutez un produit ici ou directement depuis un bon de commande." : "Aucun produit ne correspond."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.map((article) =>
            editing === article.id ? (
              <li key={article.id}>
                <ArticleForm article={article} categories={categories} onClose={() => setEditing(null)} />
              </li>
            ) : (
              <li key={article.id} className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">{article.name}</span>
                    <button type="button" onClick={() => setEditing(article.id)} aria-label={`Modifier ${article.name}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      <Pencil size={14} />
                    </button>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                    {article.category ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{article.category}</span> : null}
                    {articleDetails(article) ? <span>{articleDetails(article)}</span> : null}
                    {article.price > 0 ? (
                      <span className="tabular font-semibold text-slate-900">{eur(article.price)}</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">Prix à définir</span>
                    )}
                  </div>
                  {article.reference ? <div className="tabular mt-0.5 truncate text-[11px] text-slate-400">{article.reference}</div> : null}
                  {article.waiting > 0 ? (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      <Hourglass size={12} /> {article.waiting} attendu{article.waiting > 1 ? "s" : ""} par des clients · à réapprovisionner
                    </span>
                  ) : null}
                </div>
                <dl className="tabular grid grid-cols-3 gap-4 text-center md:w-72">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Disponible</dt>
                    <dd className={`text-lg font-semibold ${article.stock === 0 ? "text-slate-400" : "text-slate-900"}`}>{article.stock}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Réservé</dt>
                    <dd className="text-lg font-semibold text-slate-900">{article.reserved}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">En attente</dt>
                    <dd className={`text-lg font-semibold ${article.waiting ? "text-amber-700" : "text-slate-400"}`}>{article.waiting}</dd>
                  </div>
                </dl>
                <StockEntry article={article} />
              </li>
            ),
          )}
        </ul>
      )}
    </Card>
  );
}
