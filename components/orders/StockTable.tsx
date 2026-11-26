"use client";

import { Check, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { adjustStock, createArticle, updateArticle } from "@/app/commandes/actions";
import type { StockRow } from "@/lib/orders/stock";
import type { Article } from "@/lib/orders/types";
import { buttonPrimary, buttonSecondary } from "../ui";
import { useAction } from "./OrderActions";
import { inputClass } from "./bits";

export type { StockRow } from "@/lib/orders/stock";

const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

export function ArticleForm({ article, categories, suppliers = [], onClose }: { article?: Article; categories: string[]; suppliers?: string[]; onClose: () => void }) {
  const { pending, run } = useAction();
  const [name, setName] = useState(article?.name ?? "");
  const [reference, setReference] = useState(article?.reference ?? "");
  const [category, setCategory] = useState(article?.category ?? "");
  const [dimensions, setDimensions] = useState(article?.dimensions ?? "");
  const [color, setColor] = useState(article?.color ?? "");
  const [price, setPrice] = useState(article && article.price > 0 ? String(article.price) : "");
  const [cost, setCost] = useState(article && article.cost > 0 ? String(article.cost) : "");
  const [transport, setTransport] = useState(article && article.transport > 0 ? String(article.transport) : "");
  const [supplier, setSupplier] = useState(article?.supplier ?? "");
  const [stock, setStock] = useState("0");
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(
      async () => {
        const result = article
          ? await updateArticle(article.id, { name, reference, category, dimensions, color, price: num(price), cost: num(cost), transport: num(transport), supplier })
          : await createArticle({ name, reference, category, dimensions, color, price: num(price), cost: num(cost), transport: num(transport), supplier, stock: Math.floor(num(stock)) });
        if (result.ok) onClose();
        return result;
      },
      article ? "Produit modifié" : "Produit ajouté au stock",
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
      <label className="col-span-2 sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-slate-700">Fournisseur</span>
        <input className={inputClass} list="fournisseurs-stock" placeholder="Facultatif" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        <datalist id="fournisseurs-stock">
          {suppliers.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-700">Prix d&apos;achat (€)</span>
        <input className={inputClass} inputMode="decimal" placeholder="Facultatif" value={cost} onChange={(e) => setCost(e.target.value)} />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-700">Transport / pièce (€)</span>
        <input className={inputClass} inputMode="decimal" placeholder="Facultatif" value={transport} onChange={(e) => setTransport(e.target.value)} />
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

export function StockEntry({ article }: { article: StockRow }) {
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
