"use client";

import { ChevronDown, ChevronRight, Loader2, Plus, Save, Search, Trash2, Truck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { deleteTransport, saveTransport, setArticleTransport } from "@/app/commandes/actions";
import { dateFr, eur } from "@/lib/format";
import { transportTotals, type PricingSettings, type Transport } from "@/lib/orders/pricing";
import type { StockRow } from "@/lib/orders/stock";
import { Card, buttonPrimary, buttonSecondary } from "../ui";
import { confirmDialog } from "../ConfirmDialog";
import { useAction } from "./OrderActions";
import { QuickEdit } from "./StockGrid";
import { inputClass } from "./bits";

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0;

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </Card>
  );
}

/** Formulaire d'un transport : numéro, date, coût, note. */
function TransportForm({ transport, suggestion, onClose }: { transport?: Transport; suggestion: string; onClose: () => void }) {
  const { pending, run } = useAction();
  const [number, setNumber] = useState(transport?.number ?? "");
  const [date, setDate] = useState(transport?.date ?? "");
  const [cost, setCost] = useState(transport ? String(transport.cost).replace(".", ",") : "");
  const [note, setNote] = useState(transport?.note ?? "");
  return (
    <form
      className="flex flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        run(async () => {
          const result = await saveTransport({ id: transport?.id, number: number.trim() || suggestion, date, cost: num(cost), note });
          if (result.ok) onClose();
          return result;
        }, transport ? "Transport modifié" : "Transport créé");
      }}
    >
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-700">Numéro du transport</span>
        <input className={`${inputClass} w-44`} aria-label="Numéro du transport" placeholder={suggestion} value={number} onChange={(e) => setNumber(e.target.value)} autoFocus />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-700">Date d&apos;arrivée</span>
        <input type="date" className={`${inputClass} w-44`} aria-label="Date d'arrivée du transport" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-700">Coût total (€ HT)</span>
        <input className={`${inputClass} w-40`} inputMode="decimal" aria-label="Coût total du transport" placeholder="Ex. : 2 400" value={cost} onChange={(e) => setCost(e.target.value)} required />
      </label>
      <label className="min-w-[200px] flex-1">
        <span className="mb-1 block text-xs font-medium text-slate-700">Note (facultatif)</span>
        <input className={inputClass} aria-label="Note du transport" placeholder="Transporteur, provenance…" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {transport ? "Enregistrer" : "Créer le transport"}
      </button>
      <button type="button" onClick={onClose} className={buttonSecondary}>
        Annuler
      </button>
    </form>
  );
}

/** Ajout d'un produit à un transport : recherche parmi les produits qui n'y sont pas encore. */
function AddProduct({ transport, rows, onClose }: { transport: Transport; rows: StockRow[]; onClose: () => void }) {
  const { pending, run } = useAction();
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState("1");
  const matches = useMemo(() => {
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    return rows.filter((row) => row.truckId !== transport.id && words.every((w) => normalize(`${row.name} ${row.category} ${row.dimensions} ${row.color} ${row.reference} ${row.supplier}`).includes(w))).slice(0, 8);
  }, [rows, query, transport.id]);
  return (
    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} pl-9`} aria-label={`Produit à ajouter à ${transport.number}`} placeholder="Rechercher un produit à ajouter…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Pièces
          <input className={`${inputClass} w-20 text-center`} inputMode="numeric" aria-label="Nombre de pièces à ajouter" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <button type="button" onClick={onClose} className={buttonSecondary}>
          <X size={16} /> Fermer
        </button>
      </div>
      {query.trim() ? (
        <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {matches.length === 0 ? <li className="px-3 py-2.5 text-sm text-slate-500">Aucun produit ne correspond.</li> : null}
          {matches.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setArticleTransport(row.id, transport.id, Math.max(1, Math.floor(num(qty)))), `${row.name} ajouté à ${transport.number}`)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">{row.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{[row.category, row.dimensions, row.color].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">{row.truckId ? "déjà dans un autre transport : sera déplacé" : "ajouter"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Liste des transports (camions, conteneurs) avec leur contenu et la part de coût de chaque article. */
export default function TransportsBoard({ rows, pricing }: { rows: StockRow[]; pricing: PricingSettings }) {
  const { pending, run } = useAction();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(pricing.transports.map((t) => t.id)));
  const totals = useMemo(() => transportTotals(rows, pricing.transports), [rows, pricing.transports]);
  const transports = useMemo(() => [...pricing.transports].sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.number.localeCompare(a.number, "fr", { numeric: true })), [pricing.transports]);
  const suggestion = useMemo(() => {
    const used = pricing.transports.map((t) => Number((t.number.match(/(\d+)\s*$/) || [])[1]) || 0);
    return `CAM-${String(Math.max(0, ...used) + 1).padStart(3, "0")}`;
  }, [pricing.transports]);

  const totalCost = pricing.transports.reduce((t, transport) => t + transport.cost, 0);
  const totalUnits = [...totals.values()].reduce((t, entry) => t + entry.units, 0);
  const linkedProducts = rows.filter((row) => row.truckId && totals.has(row.truckId)).length;
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Transports" value={String(pricing.transports.length)} hint="camions et conteneurs enregistrés" />
        <Tile label="Coût total" value={eur(totalCost)} hint="hors taxes" />
        <Tile label="Articles transportés" value={String(totalUnits)} hint={`${linkedProducts} produit${linkedProducts > 1 ? "s" : ""} rattaché${linkedProducts > 1 ? "s" : ""}`} />
        <Tile label="Coût moyen par article" value={totalUnits > 0 ? eur(totalCost / totalUnits) : "—"} hint={`${rows.length - linkedProducts} produit${rows.length - linkedProducts > 1 ? "s" : ""} sans transport`} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-slate-600">Le coût de chaque transport est divisé entre tous ses articles : chaque pièce porte la même part, reprise dans le coût de revient du produit.</p>
          <button
            type="button"
            onClick={() => {
              setCreating((v) => !v);
              setEditing(null);
            }}
            className={buttonPrimary}
          >
            {creating ? <X size={16} /> : <Plus size={16} />} {creating ? "Fermer" : "Nouveau transport"}
          </button>
        </div>
        {creating ? <TransportForm suggestion={suggestion} onClose={() => setCreating(false)} /> : null}

        {transports.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-slate-500">Aucun transport pour l&apos;instant. Créez-en un ici, ou cochez des produits dans « Coûts & marges » puis « Nouveau transport ».</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {transports.map((transport) => {
              const entry = totals.get(transport.id)!;
              const items = rows.filter((row) => row.truckId === transport.id).sort((a, b) => a.name.localeCompare(b.name, "fr"));
              const expanded = open.has(transport.id);
              return (
                <li key={transport.id}>
                  {editing === transport.id ? (
                    <TransportForm transport={transport} suggestion={suggestion} onClose={() => setEditing(null)} />
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
                      <button type="button" onClick={() => toggle(transport.id)} aria-expanded={expanded} aria-label={`${expanded ? "Replier" : "Déplier"} ${transport.number}`} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        {expanded ? <ChevronDown size={18} className="shrink-0 text-slate-400" /> : <ChevronRight size={18} className="shrink-0 text-slate-400" />}
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-800">
                          <Truck size={18} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-base font-semibold text-slate-900">{transport.number}</span>
                          <span className="block truncate text-xs text-slate-500">{[transport.date ? `arrivé le ${dateFr(transport.date)}` : "date non renseignée", transport.note].filter(Boolean).join(" · ")}</span>
                        </span>
                      </button>
                      <dl className="tabular flex gap-5 text-right text-sm">
                        <div>
                          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Coût</dt>
                          <dd className="font-semibold text-slate-900">{eur(transport.cost)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Articles</dt>
                          <dd className="font-semibold text-slate-900">{entry.units}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Par article</dt>
                          <dd className="font-semibold text-slate-900">{entry.units > 0 ? eur(entry.perUnit) : "—"}</dd>
                        </div>
                      </dl>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEditing(transport.id)} className={buttonSecondary}>
                          Modifier
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          aria-label={`Supprimer ${transport.number}`}
                          onClick={() =>
                            void confirmDialog({ title: `Supprimer le transport ${transport.number} ?`, message: `Ses ${entry.products} produit${entry.products > 1 ? "s" : ""} seront détachés et ne porteront plus de part de transport. Les produits eux-mêmes ne sont pas supprimés.`, confirmLabel: "Supprimer", tone: "danger" }).then(
                              (ok) => ok && run(() => deleteTransport(transport.id), "Transport supprimé"),
                            )
                          }
                          className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {expanded ? (
                    <div className="border-t border-slate-100 bg-white">
                      {items.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-slate-500">Aucun produit rattaché : tant qu&apos;il est vide, son coût n&apos;est réparti nulle part.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] border-collapse text-sm">
                            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-4 py-2 font-medium">Produit</th>
                                <th className="px-3 py-2 font-medium">Fournisseur</th>
                                <th className="px-3 py-2 text-right font-medium">Pièces</th>
                                <th className="px-3 py-2 text-right font-medium">Part par pièce</th>
                                <th className="px-3 py-2 text-right font-medium">Part du produit</th>
                                <th className="w-10 px-2 py-2" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {items.map((row) => {
                                const qty = Math.max(1, row.truckQty);
                                return (
                                  <tr key={row.id}>
                                    <td className="px-4 py-2">
                                      <div className="font-medium text-slate-900">{row.name}</div>
                                      <div className="text-xs text-slate-500">{[row.category, row.dimensions, row.color].filter(Boolean).join(" · ")}</div>
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">{row.supplier || <span className="text-slate-300">—</span>}</td>
                                    <td className="tabular px-3 py-1">
                                      <div className="flex">
                                        <QuickEdit value={qty} label={`Pièces de ${row.name} dans ${transport.number}`} done="Quantité mise à jour" save={(next) => setArticleTransport(row.id, transport.id, next)} display={<span className="font-semibold text-slate-900">{qty}</span>} />
                                      </div>
                                    </td>
                                    <td className="tabular whitespace-nowrap px-3 py-2 text-right text-slate-700">{eur(entry.perUnit)}</td>
                                    <td className="tabular whitespace-nowrap px-3 py-2 text-right font-medium text-slate-900">{eur(entry.perUnit * qty)}</td>
                                    <td className="px-2 py-1">
                                      <button type="button" disabled={pending} aria-label={`Retirer ${row.name} de ${transport.number}`} title="Retirer du transport" onClick={() => run(() => setArticleTransport(row.id, "", 0), `${row.name} retiré de ${transport.number}`)} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                        <X size={15} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-slate-50 font-semibold text-slate-900">
                              <tr>
                                <td colSpan={2} className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                                  {entry.products} produit{entry.products > 1 ? "s" : ""}
                                </td>
                                <td className="tabular px-3 py-2 text-right">{entry.units}</td>
                                <td />
                                <td className="tabular whitespace-nowrap px-3 py-2 text-right">{eur(transport.cost)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                      {adding === transport.id ? (
                        <AddProduct transport={transport} rows={rows} onClose={() => setAdding(null)} />
                      ) : (
                        <div className="border-t border-slate-100 px-4 py-2.5">
                          <button type="button" onClick={() => setAdding(transport.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
                            <Plus size={15} /> Ajouter un produit à ce transport
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
