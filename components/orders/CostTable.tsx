"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, ListPlus, Loader2, PencilLine, Plus, Save, Search, Trash2, Truck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { bulkUpdateArticles, saveCostItems, saveTransport, setArticleCost, setArticlePrice, type BulkField, type BulkMode, type CostField } from "@/app/commandes/actions";
import { toast } from "@/lib/client";
import { eur } from "@/lib/format";
import Link from "next/link";
import { KIND_LABEL, costBreakdown, exVat, margin, transportTotals, type CostItem, type CostKind, type PricingSettings } from "@/lib/orders/pricing";
import type { StockRow } from "@/lib/orders/stock";
import { Card, buttonPrimary, buttonSecondary } from "../ui";
import { useAction } from "./OrderActions";
import ProductSheet from "./ProductSheet";
import { QuickEdit } from "./StockGrid";
import { inputClass } from "./bits";

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0;
const pct = (rate: number) => `${(rate * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

type SortKey = "name" | "supplier" | "cost" | "transport" | "total" | "price" | "margin" | "rate" | "stock";
type Only = "" | "chiffres" | "a-chiffrer" | "perte";

function Tile({ label, value, hint, tone = "" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`tabular mt-1 text-xl font-semibold ${tone || "text-slate-900"}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </Card>
  );
}

const dash = <span className="text-slate-300">—</span>;

let counter = 0;
const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;
const ITEM_IDEAS: [string, CostKind, string][] = [
  ["Emballage", "euro", "5"],
  ["Montage / préparation", "euro", "15"],
  ["Provision SAV et casse", "pct-achat", "2"],
  ["Frais de carte bancaire", "pct-vente", "1,5"],
  ["Commission vendeur", "pct-vente", "3"],
];

/** Liste des postes de coût du magasin : chacun s'ajoute au calcul de tous les produits, sauf valeur propre au produit. */
function CostItemsPanel({ items, onClose }: { items: CostItem[]; onClose: () => void }) {
  const { pending, run } = useAction();
  const [lines, setLines] = useState(() => items.map((item) => ({ id: item.id, label: item.label, kind: item.kind, value: String(item.value).replace(".", ",") })));
  const update = (id: string, patch: Partial<(typeof lines)[number]>) => setLines((list) => list.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = (label = "", kind: CostKind = "euro", value = "") => setLines((list) => [...list, { id: newId(), label, kind, value }]);
  const ideas = ITEM_IDEAS.filter(([label]) => !lines.some((l) => l.label.trim().toLowerCase() === label.toLowerCase()));
  return (
    <div className="border-b border-slate-100 bg-slate-50 p-4">
      <p className="text-sm text-slate-700">
        Ajoutez ici tout coût qui manque au calcul. Chaque poste a une valeur par défaut, appliquée à tous les produits ; la fiche d&apos;un produit permet de lui donner sa propre valeur. Un poste en % du prix de vente (commission, carte bancaire) est retiré de la marge.
      </p>
      {lines.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {lines.map((line) => (
            <div key={line.id} className="flex flex-wrap items-center gap-2">
              <input className={`${inputClass} min-w-[200px] flex-1`} aria-label="Nom du poste de coût" placeholder="Ex. : Emballage" value={line.label} onChange={(e) => update(line.id, { label: e.target.value })} />
              <select className={`${inputClass} w-56`} aria-label={`Type de ${line.label || "poste"}`} value={line.kind} onChange={(e) => update(line.id, { kind: e.target.value as CostKind })}>
                {(Object.keys(KIND_LABEL) as CostKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABEL[kind]}
                  </option>
                ))}
              </select>
              <input className={`${inputClass} w-28 text-right`} inputMode="decimal" aria-label={`Valeur par défaut de ${line.label || "poste"}`} placeholder="0" value={line.value} onChange={(e) => update(line.id, { value: e.target.value })} />
              <button type="button" aria-label={`Supprimer ${line.label || "le poste"}`} onClick={() => setLines((list) => list.filter((l) => l.id !== line.id))} className="grid h-9 w-9 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => add()} className={buttonSecondary}>
          <Plus size={16} /> Ajouter un poste
        </button>
        {ideas.map(([label, kind, value]) => (
          <button key={label} type="button" onClick={() => add(label, kind, value)} className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-500 hover:text-slate-900">
            + {label}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await saveCostItems(lines.map((l) => ({ id: l.id, label: l.label, kind: l.kind, value: num(l.value) })));
              if (result.ok) onClose();
              return result;
            }, "Postes de coût enregistrés")
          }
          className={`${buttonPrimary} ml-auto`}
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer les postes
        </button>
      </div>
    </div>
  );
}

/** Modifie la même information sur tous les produits cochés. */
function BulkPanel({ ids, items, onDone }: { ids: string[]; items: CostItem[]; onDone: () => void }) {
  const { pending, run } = useAction();
  const [field, setField] = useState<BulkField>("price");
  const [mode, setMode] = useState<BulkMode>("fixer");
  const [value, setValue] = useState("");
  const isText = field === "supplier" || field === "category";
  const isExtra = field.startsWith("extra:");
  // Hausse en % : pour les montants ; coefficient : seulement pour le prix de vente.
  const modes: [BulkMode, string][] = isText || isExtra ? [["fixer", "Fixer à"]] : field === "price" ? [["fixer", "Fixer à"], ["pourcent", "Augmenter de (%)"], ["coefficient", "Coût de revient ×"]] : [["fixer", "Fixer à"], ["pourcent", "Augmenter de (%)"]];
  const activeMode = modes.some(([key]) => key === mode) ? mode : "fixer";
  const hint =
    activeMode === "coefficient"
      ? "Prix de vente TTC = coût de revient HT × ce coefficient. Les produits sans prix d'achat ne sont pas modifiés."
      : activeMode === "pourcent"
        ? "Un nombre négatif fait baisser (ex. −10). Les valeurs encore vides ne sont pas modifiées."
        : isExtra
          ? "Valeur propre à ces produits pour ce poste ; 0 = le poste ne s'applique pas à eux."
          : "La même valeur est donnée à tous les produits cochés.";
  return (
    <div className="border-b border-slate-100 bg-slate-50 p-4">
      <p className="text-sm text-slate-700">
        Modifier une information sur les <span className="font-semibold">{ids.length} produit{ids.length > 1 ? "s" : ""} coché{ids.length > 1 ? "s" : ""}</span> en une fois.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-700">Information</span>
          <select className={`${inputClass} w-60`} aria-label="Information à modifier" value={field} onChange={(e) => setField(e.target.value as BulkField)}>
            <option value="price">Prix de vente TTC</option>
            <option value="cost">Prix d&apos;achat HT</option>
            <option value="transport">Transport par pièce</option>
            <option value="fees">Autres frais par pièce</option>
            <option value="customsFixed">Douane (€ par pièce)</option>
            <option value="customsRate">Douane (%)</option>
            <option value="supplier">Fournisseur</option>
            <option value="category">Catégorie</option>
            {items.map((item) => (
              <option key={item.id} value={`extra:${item.id}`}>
                Poste : {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-700">Action</span>
          <select className={`${inputClass} w-52`} aria-label="Type de modification" value={activeMode} onChange={(e) => setMode(e.target.value as BulkMode)}>
            {modes.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-700">{isText ? "Texte" : activeMode === "pourcent" ? "Pourcentage" : activeMode === "coefficient" ? "Coefficient" : "Valeur"}</span>
          <input className={`${inputClass} ${isText ? "w-60" : "w-36 text-right"}`} inputMode={isText ? "text" : "decimal"} aria-label="Nouvelle valeur" placeholder={activeMode === "coefficient" ? "Ex. : 2,2" : isText ? "" : "0"} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={pending || ids.length === 0 || (!isText && value.trim() === "")}
          onClick={() =>
            run(async () => {
              const result = await bulkUpdateArticles(ids, field, value, activeMode);
              if (result.ok) {
                toast(`${result.data} produit${result.data > 1 ? "s" : ""} modifié${result.data > 1 ? "s" : ""}${result.data < ids.length ? ` · ${ids.length - result.data} laissé${ids.length - result.data > 1 ? "s" : ""} tel${ids.length - result.data > 1 ? "s" : ""} quel${ids.length - result.data > 1 ? "s" : ""}` : ""}`);
                onDone();
              }
              return result;
            })
          }
          className={buttonPrimary}
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <PencilLine size={16} />} Appliquer aux {ids.length} produit{ids.length > 1 ? "s" : ""}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

/** Coût de revient et marge de chaque produit, avec répartition du coût d'un camion entre les articles livrés. */
export default function CostTable({ rows, vatRate, pricing, averageRevenue }: { rows: StockRow[]; vatRate: number; pricing: PricingSettings; averageRevenue: number }) {
  const { pending, run } = useAction();
  const items = pricing.costItems;
  const [panel, setPanel] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = openId ? rows.find((row) => row.id === openId) : undefined;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [only, setOnly] = useState<Only>("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [truck, setTruck] = useState(false);
  const [truckCost, setTruckCost] = useState("");
  // Transport : nouveau (numéro + date) ou existant, auquel on ajoute les produits cochés.
  const [truckId, setTruckId] = useState("");
  const [truckNumber, setTruckNumber] = useState("");
  const [truckDate, setTruckDate] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [transportFilter, setTransportFilter] = useState("");
  const trucks = useMemo(() => transportTotals(rows, pricing.transports), [rows, pricing.transports]);
  const nextNumber = useMemo(() => {
    const used = pricing.transports.map((t) => Number((t.number.match(/(\d+)\s*$/) || [])[1]) || 0);
    return `CAM-${String(Math.max(0, ...used) + 1).padStart(3, "0")}`;
  }, [pricing.transports]);

  const computed = useMemo(() => rows.map((row) => ({ row, cost: costBreakdown(row, items), margin: margin(row, vatRate, items), pieces: row.stock + row.reserved })), [rows, vatRate, items]);
  const categories = useMemo(() => [...new Set(rows.map((a) => a.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [rows]);
  const suppliers = useMemo(() => [...new Set(rows.map((a) => a.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [rows]);

  const list = useMemo(() => {
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const value = (item: (typeof computed)[number]): number | string => {
      switch (sort.key) {
        case "name":
          return item.row.name;
        case "supplier":
          return item.row.supplier;
        case "cost":
          return item.cost.purchase;
        case "transport":
          return item.cost.transport;
        case "total":
          return item.cost.total;
        case "price":
          return item.row.price;
        case "margin":
          return item.margin?.amount ?? -Infinity;
        case "rate":
          return item.margin?.rate ?? -Infinity;
        case "stock":
          return item.pieces;
      }
    };
    return computed
      .filter(({ row }) => !category || row.category === category)
      .filter(({ row }) => !supplier || row.supplier === supplier)
      .filter(({ row }) => !transportFilter || row.truckId === transportFilter)
      .filter((item) => (only === "chiffres" ? item.cost.total > 0 : only === "a-chiffrer" ? item.cost.total === 0 : only === "perte" ? Boolean(item.margin && item.margin.amount < 0) : true))
      .filter(({ row }) => {
        const text = normalize(`${row.name} ${row.category} ${row.dimensions} ${row.color} ${row.reference} ${row.supplier}`);
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => {
        const x = value(a), y = value(b);
        const order = typeof x === "string" ? x.localeCompare(String(y), "fr") : (x as number) - (y as number);
        return (sort.desc ? -order : order) || a.row.name.localeCompare(b.row.name, "fr") || a.row.dimensions.localeCompare(b.row.dimensions, "fr", { numeric: true });
      });
  }, [computed, query, category, supplier, transportFilter, only, sort]);

  // Synthèse sur les produits affichés.
  const costed = list.filter((item) => item.cost.total > 0);
  const priced = costed.filter((item) => item.margin);
  const stockCost = costed.reduce((t, item) => t + item.cost.total * item.pieces, 0);
  const stockSalesHt = priced.reduce((t, item) => t + item.margin!.priceHt * item.pieces, 0);
  const stockMargin = priced.reduce((t, item) => t + item.margin!.amount * item.pieces, 0);
  const averageRate = priced.length ? priced.reduce((t, item) => t + item.margin!.rate, 0) / priced.length : 0;
  const losing = computed.filter((item) => item.margin && item.margin.amount < 0).length;
  const filters: [Only, string, number][] = [
    ["", "Tout", rows.length],
    ["chiffres", "Coût renseigné", computed.filter((item) => item.cost.total > 0).length],
    ["a-chiffrer", "Coût à renseigner", computed.filter((item) => item.cost.total === 0).length],
    ["perte", "Vendus à perte", losing],
  ];

  const visibleIds = list.map((item) => item.row.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visibleIds));
  const chosen = computed.filter((item) => selected.has(item.row.id));
  // Quantité de chaque produit coché dans le transport : celle saisie, sinon ses pièces en magasin (au moins 1).
  const quantityOf = (item: (typeof computed)[number]) => Math.max(1, Math.floor(num(quantities[item.row.id] ?? "")) || (item.row.truckId === truckId && item.row.truckQty > 0 ? item.row.truckQty : item.pieces) || 1);
  const existing = truckId ? trucks.get(truckId) : undefined;
  // Articles déjà dans le transport choisi, hors produits cochés (qui sont recomptés avec leur nouvelle quantité).
  const alreadyIn = existing ? rows.filter((row) => row.truckId === truckId && !selected.has(row.id)).reduce((t, row) => t + Math.max(1, row.truckQty), 0) : 0;
  const truckTotal = alreadyIn + chosen.reduce((t, item) => t + quantityOf(item), 0);
  const effectiveCost = existing && truckCost.trim() === "" ? existing.transport.cost : num(truckCost);
  const share = effectiveCost > 0 && truckTotal > 0 ? effectiveCost / truckTotal : 0;
  const pickTruck = (id: string) => {
    setTruckId(id);
    const picked = pricing.transports.find((t) => t.id === id);
    setTruckNumber(picked?.number ?? "");
    setTruckDate(picked?.date ?? "");
    setTruckCost(picked ? String(picked.cost).replace(".", ",") : "");
  };

  const header = (key: SortKey, label: string, numeric = true) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"} className={`px-2.5 py-2.5 font-medium ${numeric ? "text-right" : ""}`}>
      <button type="button" onClick={() => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: numeric }))} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900 ${sort.key === key ? "text-slate-900" : ""}`}>
        {label}
        {sort.key === key ? sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} /> : <ChevronsUpDown size={12} className="text-slate-300" />}
      </button>
    </th>
  );
  const edit = (row: StockRow, field: CostField, label: string, done: string, display: React.ReactNode, decimal = true) => (
    <div className="flex">
      <QuickEdit decimal={decimal} value={row[field]} label={`${label} de ${row.name}`} done={done} save={(next) => setArticleCost(row.id, field, next)} display={display} />
    </div>
  );

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Produits chiffrés" value={`${costed.length} / ${list.length}`} hint={list.length - costed.length ? `${list.length - costed.length} sans prix d'achat` : "tous les coûts sont renseignés"} />
        <Tile label="Coût du stock (HT)" value={costed.length ? eur(stockCost) : "—"} hint="coût de revient × pièces en magasin" />
        <Tile label="Valeur de vente (HT)" value={priced.length ? eur(stockSalesHt) : "—"} hint={`hors TVA de ${vatRate} %`} />
        <Tile label="Marge brute du stock" value={priced.length ? eur(stockMargin) : "—"} hint={stockSalesHt > 0 ? `${pct(stockMargin / stockSalesHt)} de la valeur de vente` : "vente HT − coût de revient"} tone={stockMargin < 0 ? "text-rose-700" : ""} />
        <Tile label="Marge moyenne" value={priced.length ? pct(averageRate) : "—"} hint={losing ? `${losing} produit${losing > 1 ? "s" : ""} vendu${losing > 1 ? "s" : ""} à perte` : "par produit, sur le prix HT"} tone={losing ? "text-rose-700" : ""} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-3 md:px-4">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher : nom, catégorie, fournisseur, référence…" aria-label="Rechercher un produit" className={`${inputClass} pl-9`} />
          </div>
          {categories.length > 0 ? (
            <div className="w-full sm:w-52">
              <select className={inputClass} aria-label="Filtrer par catégorie" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Toutes les catégories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {suppliers.length > 0 ? (
            <div className="w-full sm:w-52">
              <select className={inputClass} aria-label="Filtrer par fournisseur" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">Tous les fournisseurs</option>
                {suppliers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {pricing.transports.length > 0 ? (
            <div className="w-full sm:w-48">
              <select className={inputClass} aria-label="Filtrer par transport" value={transportFilter} onChange={(e) => setTransportFilter(e.target.value)}>
                <option value="">Tous les transports</option>
                {pricing.transports.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.number} ({trucks.get(t.id)?.units ?? 0} articles)
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setTruck((v) => !v);
              setPanel(false);
            }}
            className={buttonPrimary}
          >
            {truck ? <X size={16} /> : <Truck size={16} />} {truck ? "Fermer" : "Nouveau transport"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPanel((v) => !v);
              setTruck(false);
            }}
            className={buttonSecondary}
          >
            {panel ? <X size={16} /> : <ListPlus size={16} />} {panel ? "Fermer" : `Postes de coût${items.length ? ` (${items.length})` : ""}`}
          </button>
          <button
            type="button"
            onClick={() => {
              setBulk((v) => !v);
              setPanel(false);
              setTruck(false);
            }}
            className={buttonSecondary}
          >
            {bulk ? <X size={16} /> : <PencilLine size={16} />} {bulk ? "Fermer" : `Modifier la sélection${selected.size ? ` (${selected.size})` : ""}`}
          </button>
          <div className="flex w-full flex-wrap items-center gap-2">
            {filters.map(([key, label, count]) => (
              <button key={key} type="button" aria-pressed={only === key} onClick={() => setOnly(key)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${only === key ? "border-black bg-black text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>
                {label} <span className={`tabular ${only === key ? "text-white/70" : "text-slate-400"}`}>{count}</span>
              </button>
            ))}
            <span className="tabular ml-auto text-xs text-slate-500">
              {list.length} produit{list.length > 1 ? "s" : ""} · {selected.size} coché{selected.size > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {panel ? <CostItemsPanel items={items} onClose={() => setPanel(false)} /> : null}
        {bulk ? (
          selected.size > 0 ? (
            <BulkPanel
              ids={[...selected]}
              items={items}
              onDone={() => {
                setBulk(false);
                setSelected(new Set());
              }}
            />
          ) : (
            <p className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">Cochez d&apos;abord les produits à modifier dans le tableau (la case du haut coche tous les produits affichés).</p>
          )
        ) : null}
        {truck ? (
          <div className="border-b border-slate-100 bg-slate-50 p-4">
            <p className="text-sm text-slate-700">
              Cochez dans le tableau les produits arrivés par le même camion (ou conteneur). Donnez-lui un numéro et son coût total : il est divisé entre tous ses articles, chaque pièce portant la même part. Vous retrouvez ensuite chaque transport et son contenu dans l&apos;onglet « Transports ».
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              {pricing.transports.length > 0 ? (
                <label>
                  <span className="mb-1 block text-xs font-medium text-slate-700">Transport</span>
                  <select className={`${inputClass} w-56`} aria-label="Transport concerné" value={truckId} onChange={(e) => pickTruck(e.target.value)}>
                    <option value="">Nouveau transport</option>
                    {pricing.transports.map((t) => (
                      <option key={t.id} value={t.id}>
                        Ajouter à {t.number}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-700">Numéro du transport</span>
                <input className={`${inputClass} w-44`} aria-label="Numéro du transport" placeholder={nextNumber} value={truckNumber} onChange={(e) => setTruckNumber(e.target.value)} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-700">Date d&apos;arrivée</span>
                <input type="date" className={`${inputClass} w-44`} aria-label="Date d'arrivée du transport" value={truckDate} onChange={(e) => setTruckDate(e.target.value)} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-700">Coût total du transport (€ HT)</span>
                <input className={`${inputClass} w-44`} inputMode="decimal" placeholder="Ex. : 2 400" aria-label="Coût total du camion" value={truckCost} onChange={(e) => setTruckCost(e.target.value)} />
              </label>
            </div>
            {chosen.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Produit coché</th>
                      <th className="px-3 py-2 text-right font-medium">Pièces dans ce transport</th>
                      <th className="px-3 py-2 text-right font-medium">Part de transport</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {chosen.map((item) => (
                      <tr key={item.row.id}>
                        <td className="px-3 py-1.5">
                          <span className="font-medium text-slate-900">{item.row.name}</span>
                          <span className="ml-2 text-xs text-slate-500">{[item.row.dimensions, item.row.color].filter(Boolean).join(" · ")}</span>
                        </td>
                        <td className="px-3 py-1.5">
                          <input className={`${inputClass} ml-auto w-24 text-right`} inputMode="numeric" aria-label={`Pièces de ${item.row.name} dans le transport`} placeholder={String(quantityOf(item))} value={quantities[item.row.id] ?? ""} onChange={(e) => setQuantities((current) => ({ ...current, [item.row.id]: e.target.value }))} />
                        </td>
                        <td className="tabular whitespace-nowrap px-3 py-1.5 text-right text-slate-700">{share > 0 ? `${eur(share * quantityOf(item))} (${eur(share)} × ${quantityOf(item)})` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">Aucun produit coché : cochez les lignes concernées dans le tableau ci-dessous.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="text-sm">
                <span className="text-slate-500">Articles dans le transport : </span>
                <span className="tabular font-semibold text-slate-900">{truckTotal}</span>
                {alreadyIn > 0 ? <span className="text-slate-500"> (dont {alreadyIn} déjà rattachés)</span> : null}
                <span className="ml-4 text-slate-500">Part par article : </span>
                <span className="tabular font-semibold text-slate-900">{share > 0 ? eur(share) : "—"}</span>
              </div>
              <button
                type="button"
                disabled={pending || selected.size === 0 || effectiveCost <= 0}
                onClick={() =>
                  run(async () => {
                    const result = await saveTransport({ id: truckId || undefined, number: truckNumber.trim() || nextNumber, date: truckDate, cost: effectiveCost, items: chosen.map((item) => ({ articleId: item.row.id, qty: quantityOf(item) })) });
                    if (result.ok) {
                      setSelected(new Set());
                      setTruck(false);
                      setTruckCost("");
                      setTruckNumber("");
                      setTruckDate("");
                      setTruckId("");
                      setQuantities({});
                    }
                    return result;
                  }, `Transport enregistré : ${selected.size} produit${selected.size > 1 ? "s" : ""} rattaché${selected.size > 1 ? "s" : ""}`)
                }
                className={`${buttonPrimary} ml-auto`}
              >
                {pending ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />} Enregistrer le transport ({selected.size} produit{selected.size > 1 ? "s" : ""})
              </button>
            </div>
          </div>
        ) : null}

        {list.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-slate-500">{rows.length === 0 ? "Aucun produit. Ajoutez-les d'abord dans l'onglet Stock." : "Aucun produit ne correspond."}</p>
        ) : (
          <div className="max-h-[calc(100dvh-150px)] min-h-[420px] overflow-auto">
            <table className="w-full min-w-[1880px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 shadow-[0_1px_0_#e2e8f0]">
                <tr>
                  <th scope="col" className="w-9 px-2.5 py-2.5">
                    <input type="checkbox" className="h-4 w-4 accent-black" aria-label="Cocher tous les produits affichés" checked={allSelected} onChange={toggleAll} />
                  </th>
                  {header("name", "Produit", false)}
                  {header("supplier", "Fournisseur", false)}
                  {header("cost", "Achat HT")}
                  <th scope="col" className="px-2.5 py-2.5 text-right font-medium">Transport</th>
                  <th scope="col" className="px-2.5 py-2.5 text-right font-medium">Articles</th>
                  {header("transport", "Transport / pièce")}
                  <th scope="col" className="px-2.5 py-2.5 text-right font-medium">Autres frais</th>
                  <th scope="col" className="px-2.5 py-2.5 text-right font-medium">Postes</th>
                  <th scope="col" className="px-2.5 py-2.5 text-right font-medium">Sous-total HT</th>
                  <th scope="col" className="px-2.5 py-2.5 text-right font-medium">TVA 20 %</th>
                  <th scope="col" className="px-2.5 py-2.5 text-right font-medium">Douane</th>
                  <th scope="col" className="px-2.5 py-2.5 text-right font-medium">Coût total TTC</th>
                  {header("total", "Coût de revient HT")}
                  {header("price", "Vente TTC")}
                  <th scope="col" className="px-2.5 py-2.5 text-right font-medium">Vente HT</th>
                  {header("margin", "Marge brute")}
                  {header("rate", "Taux")}
                  {header("stock", "Pièces")}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map(({ row, cost, margin: m, pieces }) => {
                  const viaTruck = row.truckCost > 0 && row.truckUnits > 0;
                  const linked = row.truckId ? trucks.get(row.truckId) : undefined;
                  return (
                    <tr key={row.id} className={selected.has(row.id) ? "bg-sky-50/60" : "hover:bg-slate-50/70"}>
                      <td className="px-2.5 py-2">
                        <input type="checkbox" className="h-4 w-4 accent-black" aria-label={`Cocher ${row.name}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                      </td>
                      <td className="px-2.5 py-2">
                        <button type="button" onClick={() => setOpenId(row.id)} aria-label={`Ouvrir la fiche de ${row.name}`} title="Ouvrir la fiche complète" className="text-left font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900">
                          {row.name}
                        </button>
                        <div className="text-xs text-slate-500">{[row.category, row.dimensions, row.color].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="px-2.5 py-2 text-slate-700">{row.supplier || dash}</td>
                      <td className="tabular whitespace-nowrap px-2.5 py-1">{edit(row, "cost", "Prix d'achat", "Prix d'achat enregistré", row.cost > 0 ? <span className="font-medium text-slate-900">{eur(row.cost)}</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">À saisir</span>)}</td>
                      {linked ? (
                        <>
                          <td className="whitespace-nowrap px-2.5 py-2 text-right">
                            <Link href="/stock/transports" title={`${eur(linked.transport.cost)} · ouvrir les transports`} className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 hover:bg-sky-200">
                              {linked.transport.number}
                            </Link>
                            <div className="tabular mt-0.5 text-[11px] text-slate-500">{eur(linked.transport.cost)}</div>
                          </td>
                          <td className="tabular whitespace-nowrap px-2.5 py-2 text-right">
                            <div className="text-slate-900">{linked.units}</div>
                            <div className="text-[11px] text-slate-500">dont {Math.max(1, row.truckQty)} de ce produit</div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="tabular whitespace-nowrap px-2.5 py-1">{edit(row, "truckCost", "Coût du camion", "Camion enregistré", row.truckCost > 0 ? eur(row.truckCost) : dash)}</td>
                          <td className="tabular whitespace-nowrap px-2.5 py-1">{edit(row, "truckUnits", "Nombre d'articles du camion", "Camion enregistré", row.truckUnits > 0 ? row.truckUnits : dash, false)}</td>
                        </>
                      )}
                      <td className="tabular whitespace-nowrap px-2.5 py-1">
                        {viaTruck ? (
                          <div className="px-2 py-1 text-right text-slate-900" title={`${eur(row.truckCost)} ÷ ${row.truckUnits} articles`}>
                            {eur(cost.transport || row.truckCost / row.truckUnits)}
                          </div>
                        ) : (
                          edit(row, "transport", "Transport", "Transport enregistré", row.transport > 0 ? eur(row.transport) : dash)
                        )}
                      </td>
                      <td className="tabular whitespace-nowrap px-2.5 py-1">{edit(row, "fees", "Autres frais", "Frais enregistrés", row.fees > 0 ? eur(row.fees) : dash)}</td>
                      <td className="tabular whitespace-nowrap px-2.5 py-2 text-right" title={[...cost.extras, ...cost.salesItems].map((line) => `${line.label} : ${line.kind === "euro" ? eur(line.amount) : `${line.value} %`}`).join("\n")}>
                        {cost.extrasTotal > 0 || cost.salesRate > 0 ? (
                          <>
                            <div className="text-slate-900">{cost.extrasTotal > 0 ? eur(cost.extrasTotal) : "—"}</div>
                            {cost.salesRate > 0 ? <div className="text-[11px] text-slate-500">+ {pct(cost.salesRate)} du prix</div> : null}
                          </>
                        ) : (
                          dash
                        )}
                      </td>
                      <td className="tabular whitespace-nowrap px-2.5 py-2 text-right text-slate-900">{cost.total > 0 ? eur(cost.subtotal) : dash}</td>
                      <td className="tabular whitespace-nowrap px-2.5 py-2 text-right text-slate-600">{cost.total > 0 ? eur(cost.vat) : dash}</td>
                      <td className="tabular whitespace-nowrap px-2.5 py-0.5">
                        {edit(row, "customsFixed", "Douane (€)", "Douane enregistrée", row.customsFixed > 0 ? eur(row.customsFixed) : <span className="text-xs text-slate-300">€ —</span>)}
                        {edit(row, "customsRate", "Douane (%)", "Douane enregistrée", row.customsRate > 0 ? <span className="text-[11px] text-slate-600">{row.customsRate.toLocaleString("fr-FR")} %{cost.total > 0 ? ` = ${eur(cost.customs - row.customsFixed)}` : ""}</span> : <span className="text-[11px] text-slate-300">% —</span>)}
                      </td>
                      <td className="tabular whitespace-nowrap px-2.5 py-2 text-right font-semibold text-slate-900">{cost.total > 0 ? eur(cost.totalTtc) : dash}</td>
                      <td className="tabular whitespace-nowrap px-2.5 py-2 text-right font-semibold text-slate-900">{cost.total > 0 ? eur(cost.total) : dash}</td>
                      <td className="tabular whitespace-nowrap px-2.5 py-1">
                        <div className="flex">
                          <QuickEdit decimal value={row.price} label={`Prix de vente de ${row.name}`} done="Prix de vente enregistré" save={(next) => setArticlePrice(row.id, next)} display={row.price > 0 ? <span className="font-medium text-slate-900">{eur(row.price)}</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">À définir</span>} />
                        </div>
                      </td>
                      <td className="tabular whitespace-nowrap px-2.5 py-2 text-right text-slate-700">{row.price > 0 ? eur(exVat(row.price, vatRate)) : dash}</td>
                      <td className={`tabular whitespace-nowrap px-2.5 py-2 text-right font-semibold ${m ? (m.amount < 0 ? "text-rose-700" : "text-emerald-700") : ""}`}>{m ? eur(m.amount) : dash}</td>
                      <td className="tabular whitespace-nowrap px-2.5 py-2 text-right">
                        {m ? (
                          <>
                            <div className={m.amount < 0 ? "text-rose-700" : "text-slate-900"}>{pct(m.rate)}</div>
                            <div className="text-[11px] text-slate-500">coef. {m.coefficient.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</div>
                          </>
                        ) : (
                          dash
                        )}
                      </td>
                      <td className={`tabular px-2.5 py-2 text-right ${pieces ? "text-slate-900" : "text-slate-400"}`}>{pieces}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-slate-50 text-sm font-semibold text-slate-900 shadow-[0_-1px_0_#e2e8f0]">
                <tr>
                  <td colSpan={12} className="px-2.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                    Total des pièces en magasin ({list.length} produit{list.length > 1 ? "s" : ""} affiché{list.length > 1 ? "s" : ""})
                  </td>
                  <td className="tabular whitespace-nowrap px-2.5 py-2.5 text-right">{costed.length ? eur(costed.reduce((t, item) => t + item.cost.totalTtc * item.pieces, 0)) : "—"}</td>
                  <td className="tabular whitespace-nowrap px-2.5 py-2.5 text-right">{costed.length ? eur(stockCost) : "—"}</td>
                  <td className="tabular whitespace-nowrap px-2.5 py-2.5 text-right">{eur(list.reduce((t, item) => t + item.row.price * item.pieces, 0))}</td>
                  <td className="tabular whitespace-nowrap px-2.5 py-2.5 text-right">{eur(list.reduce((t, item) => t + exVat(item.row.price, vatRate) * item.pieces, 0))}</td>
                  <td className={`tabular whitespace-nowrap px-2.5 py-2.5 text-right ${stockMargin < 0 ? "text-rose-700" : "text-emerald-700"}`}>{priced.length ? eur(stockMargin) : "—"}</td>
                  <td className="tabular whitespace-nowrap px-2.5 py-2.5 text-right">{stockSalesHt > 0 ? pct(stockMargin / stockSalesHt) : "—"}</td>
                  <td className="tabular px-2.5 py-2.5 text-right">{list.reduce((t, item) => t + item.pieces, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      {opened ? <ProductSheet key={opened.id} row={opened} pricing={pricing} vatRate={vatRate} averageRevenue={averageRevenue} trucks={trucks} onClose={() => setOpenId(null)} /> : null}
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Sous-total HT = achat + transport + autres frais + vos postes. La TVA de 20 % se calcule sur ce sous-total, jamais sur la douane, qui vient en plus : coût total TTC = sous-total + TVA + douane. La marge se calcule hors taxes, sur le coût de revient HT (sous-total + douane), car la TVA payée à l&apos;achat est récupérée. Cliquez sur le nom d&apos;un produit pour ouvrir sa fiche complète. Le prix de vente est TTC : la marge se calcule sur son montant hors taxes (TVA {vatRate} %). Elle ne tient pas
        encore compte des charges du magasin : c&apos;est le rôle de l&apos;onglet « Prix de vente (PVC) ».
      </p>
    </>
  );
}
