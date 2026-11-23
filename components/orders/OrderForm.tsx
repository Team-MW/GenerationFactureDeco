"use client";

import { Check, Gift, Hourglass, Loader2, Minus, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createOrder } from "@/app/commandes/actions";
import { toast } from "@/lib/client";
import { eur } from "@/lib/format";
import { DELIVERY_MODES, SHOPS, orderTotals } from "@/lib/orders/logic";
import type { Article, DeliveryMode, OrderInput, ShopId, Slot } from "@/lib/orders/types";
import { Card, CardHeader, buttonPrimary } from "../ui";
import { inputClass } from "./bits";

interface FormLine {
  key: number;
  /** Article existant, ou null pour un article créé à la volée. */
  articleId: string | null;
  name: string;
  reference: string;
  price: string;
  stock: string;
  quantity: number;
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export default function OrderForm({ articles }: { articles: Article[] }) {
  const router = useRouter();
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", postalCode: "", city: "", notes: "" });
  const [shop, setShop] = useState<ShopId>("toulouse");
  const [observations, setObservations] = useState("");
  const [deposit, setDeposit] = useState("");
  const [lines, setLines] = useState<FormLine[]>([]);
  const [query, setQuery] = useState("");
  const [nextKey, setNextKey] = useState(1);
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [mode, setMode] = useState<DeliveryMode>("porte");
  const [adjustKind, setAdjustKind] = useState<"plus" | "minus">("plus");
  const [adjustValue, setAdjustValue] = useState("");
  const [offered, setOffered] = useState(false);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<Slot>("");
  const [saving, setSaving] = useState(false);

  const byId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);
  const matches = useMemo(() => {
    const q = normalize(query.trim());
    const used = new Set(lines.map((l) => l.articleId));
    return articles
      .filter((a) => !used.has(a.id) && (!q || normalize(`${a.name} ${a.reference}`).includes(q)))
      .slice(0, 6);
  }, [articles, lines, query]);

  const addExisting = (article: Article) => {
    setLines((list) => [
      ...list,
      { key: nextKey, articleId: article.id, name: article.name, reference: article.reference, price: String(article.price), stock: "", quantity: 1 },
    ]);
    setNextKey((k) => k + 1);
    setQuery("");
  };
  const addNew = () => {
    setLines((list) => [...list, { key: nextKey, articleId: null, name: query.trim(), reference: "", price: "", stock: "0", quantity: 1 }]);
    setNextKey((k) => k + 1);
    setQuery("");
  };
  const update = (key: number, patch: Partial<FormLine>) =>
    setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const adjustment = mode === "retrait" ? 0 : num(adjustValue) * (adjustKind === "plus" ? 1 : -1);
  const totals = orderTotals({
    lines: lines.map((l) => ({ id: "", articleId: "", name: "", reference: "", reserved: true, unitPrice: num(l.price), quantity: l.quantity })),
    discount: { type: discountType, value: num(discountValue) },
    delivery: { mode, basePrice: DELIVERY_MODES[mode].price, adjustment, offered: mode !== "retrait" && offered },
  });

  /** Disponibilité d'une ligne au moment de la saisie. */
  const availability = (line: FormLine) => {
    const available = line.articleId ? (byId.get(line.articleId)?.stock ?? 0) : Math.floor(num(line.stock));
    return { available, enough: available >= line.quantity };
  };
  const waiting = lines.filter((l) => !availability(l).enough).length;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lines.length === 0) return toast("Ajoutez au moins un article.", "error");
    const input: OrderInput = {
      shop,
      observations,
      paid: Math.min(num(deposit), totals.total),
      customer,
      lines: lines.map((l) =>
        l.articleId
          ? { articleId: l.articleId, quantity: l.quantity }
          : { newArticle: { name: l.name, reference: l.reference, price: num(l.price), stock: Math.floor(num(l.stock)) }, quantity: l.quantity },
      ),
      discount: { type: discountType, value: num(discountValue) },
      delivery: { mode, adjustment, offered },
      scheduledDate: date || null,
      slot,
    };
    setSaving(true);
    const result = await createOrder(input);
    setSaving(false);
    if (!result.ok) return toast(result.error, "error");
    toast("Bon de commande créé");
    router.push(`/commandes/${result.data}`);
  };

  const text = (key: keyof typeof customer, placeholder = "") => ({
    className: inputClass,
    placeholder,
    value: customer[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCustomer((c) => ({ ...c, [key]: e.target.value })),
  });

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="flex flex-col gap-4 xl:col-span-2">
        <Card>
          <CardHeader title="Client" />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-6 md:p-5">
            <Field label="Magasin" className="sm:col-span-6">
              <div className="grid grid-cols-2 gap-2 sm:max-w-md">
                {(Object.keys(SHOPS) as ShopId[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={shop === key}
                    onClick={() => setShop(key)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      shop === key ? "border-black bg-black text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    {SHOPS[key].label.replace("DECOSHOP ", "")[0] + SHOPS[key].label.replace("DECOSHOP ", "").slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Nom et prénom" className="sm:col-span-6">
              <input {...text("name")} required />
            </Field>
            <Field label="Téléphone" className="sm:col-span-3">
              <input {...text("phone")} type="tel" inputMode="tel" />
            </Field>
            <Field label="E-mail (facultatif)" className="sm:col-span-3">
              <input {...text("email")} type="email" inputMode="email" />
            </Field>
            <Field label={mode === "retrait" ? "Adresse (facultatif)" : "Adresse de livraison"} className="sm:col-span-6">
              <input {...text("address", "Numéro et rue")} required={mode !== "retrait"} />
            </Field>
            <Field label="Code postal" className="sm:col-span-2">
              <input {...text("postalCode")} inputMode="numeric" />
            </Field>
            <Field label="Ville" className="sm:col-span-4">
              <input {...text("city")} required={mode !== "retrait"} />
            </Field>
            <Field label="Précisions pour la livraison (étage, code, ascenseur…)" className="sm:col-span-6">
              <textarea {...text("notes")} rows={2} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Articles" hint="Sélectionnez un article du stock ou créez-en un nouveau" />
          <div className="p-4 md:p-5">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                placeholder="Rechercher un article ou saisir un nouveau nom…"
                className={`${inputClass} pl-9`}
              />
              {query.trim() || (lines.length === 0 && articles.length > 0) ? (
                <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                  {matches.map((article) => (
                    <li key={article.id}>
                      <button type="button" onClick={() => addExisting(article)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">{article.name}</span>
                          <span className="tabular text-xs text-slate-500">
                            {article.reference ? `${article.reference} · ` : ""}
                            {article.stock > 0 ? `${article.stock} en stock` : "Rupture de stock"}
                          </span>
                        </span>
                        <span className="tabular shrink-0 font-semibold text-slate-900">{eur(article.price)}</span>
                      </button>
                    </li>
                  ))}
                  {query.trim() ? (
                    <li>
                      <button type="button" onClick={addNew} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-slate-900 hover:bg-slate-50">
                        <Plus size={16} /> Créer l&apos;article « {query.trim()} »
                      </button>
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>

            {lines.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Aucun article pour l&apos;instant.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {lines.map((line) => {
                  const { available, enough } = availability(line);
                  return (
                    <li key={line.key} className="rounded-lg border border-slate-200 p-3">
                      {line.articleId ? (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-900">{line.name}</div>
                            <div className="tabular text-xs text-slate-500">
                              {line.reference ? `${line.reference} · ` : ""}
                              {eur(num(line.price))} l&apos;unité
                            </div>
                          </div>
                          <div className="tabular shrink-0 text-sm font-semibold text-slate-900">{eur(num(line.price) * line.quantity)}</div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                          <Field label="Nouvel article" className="col-span-2 sm:col-span-3">
                            <input className={inputClass} value={line.name} onChange={(e) => update(line.key, { name: e.target.value })} required />
                          </Field>
                          <Field label="Référence" className="col-span-2 sm:col-span-1">
                            <input className={inputClass} value={line.reference} onChange={(e) => update(line.key, { reference: e.target.value })} />
                          </Field>
                          <Field label="Prix TTC (€)">
                            <input className={inputClass} inputMode="decimal" value={line.price} onChange={(e) => update(line.key, { price: e.target.value })} required />
                          </Field>
                          <Field label="Stock actuel">
                            <input className={inputClass} inputMode="numeric" value={line.stock} onChange={(e) => update(line.key, { stock: e.target.value })} />
                          </Field>
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1">
                          <button type="button" aria-label="Diminuer la quantité" onClick={() => update(line.key, { quantity: Math.max(1, line.quantity - 1) })} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                            <Minus size={16} />
                          </button>
                          <span className="tabular w-9 text-center text-sm font-semibold">{line.quantity}</span>
                          <button type="button" aria-label="Augmenter la quantité" onClick={() => update(line.key, { quantity: line.quantity + 1 })} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                            <Plus size={16} />
                          </button>
                        </div>
                        {enough ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            <Check size={12} strokeWidth={2.5} /> En stock ({available})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                            <Hourglass size={12} /> En attente ({available} dispo)
                          </span>
                        )}
                        <button type="button" aria-label="Retirer l'article" onClick={() => setLines((list) => list.filter((l) => l.key !== line.key))} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-sm">
              <Field label="Réduction">
                <select className={inputClass} value={discountType} onChange={(e) => setDiscountType(e.target.value as "percent" | "amount")}>
                  <option value="percent">En pourcentage (%)</option>
                  <option value="amount">En montant (€)</option>
                </select>
              </Field>
              <Field label={discountType === "percent" ? "Pourcentage" : "Montant (€)"}>
                <input className={inputClass} inputMode="decimal" placeholder="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Livraison" hint="Ajoutée comme une ligne du bon de livraison" />
          <div className="p-4 md:p-5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(DELIVERY_MODES) as DeliveryMode[]).map((key) => {
                const option = DELIVERY_MODES[key];
                const active = mode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setMode(key)}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition ${
                      active ? "border-black bg-black text-white" : "border-slate-200 bg-white text-slate-900 hover:border-slate-400"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className={`text-xs ${active ? "text-neutral-300" : "text-slate-500"}`}>{option.hint}</span>
                    </span>
                    <span className="tabular shrink-0 text-sm font-semibold">{option.price ? eur(option.price) : "Gratuit"}</span>
                  </button>
                );
              })}
            </div>

            {mode !== "retrait" ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Ajuster le prix" className="sm:col-span-2">
                  <select className={inputClass} value={adjustKind} onChange={(e) => setAdjustKind(e.target.value as "plus" | "minus")} disabled={offered}>
                    <option value="plus">Supplément (plus loin…)</option>
                    <option value="minus">Remise sur la livraison</option>
                  </select>
                </Field>
                <Field label="Montant (€)">
                  <input className={inputClass} inputMode="decimal" placeholder="0" value={adjustValue} onChange={(e) => setAdjustValue(e.target.value)} disabled={offered} />
                </Field>
                <button
                  type="button"
                  aria-pressed={offered}
                  onClick={() => setOffered((v) => !v)}
                  className={`col-span-2 mt-auto flex h-[42px] items-center justify-center gap-2 rounded-lg border text-sm font-medium transition sm:col-span-1 md:h-[38px] ${
                    offered ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Gift size={16} /> {offered ? "Livraison offerte" : "Offrir la livraison"}
                </button>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-sm">
              <Field label={mode === "retrait" ? "Date de retrait (facultatif)" : "Date de livraison (facultatif)"}>
                <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Créneau">
                <select className={inputClass} value={slot} onChange={(e) => setSlot(e.target.value as Slot)} disabled={!date}>
                  <option value="">Journée</option>
                  <option value="matin">Matin</option>
                  <option value="apres-midi">Après-midi</option>
                </select>
              </Field>
            </div>
            {!date ? <p className="mt-2 text-xs text-slate-500">Sans date, la commande apparaîtra dans « À programmer » de l&apos;espace livraison.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Observations et paiement" hint="Repris sur le bon de commande" />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-6 md:p-5">
            <Field label="Observations et délais" className="sm:col-span-4">
              <textarea className={inputClass} rows={2} placeholder="Ex. : délai 2 mois" value={observations} onChange={(e) => setObservations(e.target.value)} />
            </Field>
            <Field label="Acompte versé (€)" className="sm:col-span-2">
              <input className={inputClass} inputMode="decimal" placeholder="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
              <button type="button" onClick={() => setDeposit(String(totals.total))} className="mt-1.5 text-xs font-medium text-slate-600 underline hover:text-slate-900">
                Payé en totalité
              </button>
            </Field>
          </div>
        </Card>
      </div>

      <div>
        <Card className="sticky top-6 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Récapitulatif</h2>
          <dl className="tabular mt-4 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Articles ({lines.reduce((t, l) => t + l.quantity, 0)})</dt>
              <dd className="text-slate-900">{eur(totals.subtotal)}</dd>
            </div>
            {totals.discount > 0 ? (
              <div className="flex justify-between">
                <dt className="text-slate-500">Réduction{discountType === "percent" ? ` (${num(discountValue)} %)` : ""}</dt>
                <dd className="text-slate-900">− {eur(totals.discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-slate-500">{DELIVERY_MODES[mode].short}</dt>
              <dd className="text-slate-900">{mode !== "retrait" && offered ? "Offerte" : totals.delivery ? eur(totals.delivery) : "Gratuit"}</dd>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-3">
              <dt className="font-semibold text-slate-900">Total TTC</dt>
              <dd className="text-xl font-semibold text-slate-900">{eur(totals.total)}</dd>
            </div>
            {num(deposit) > 0 ? (
              <>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Acompte</dt>
                  <dd className="text-slate-900">{eur(Math.min(num(deposit), totals.total))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Reste à payer</dt>
                  <dd className="font-semibold text-slate-900">{eur(Math.max(0, totals.total - num(deposit)))}</dd>
                </div>
              </>
            ) : null}
          </dl>
          {waiting > 0 ? (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <Hourglass size={14} className="mt-0.5 shrink-0" />
              {waiting} article{waiting > 1 ? "s" : ""} en attente de stock : la commande sera livrable dès leur arrivée.
            </p>
          ) : null}
          <button type="submit" disabled={saving} className={`${buttonPrimary} mt-5 w-full justify-center py-2.5`}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Créer le bon de commande
          </button>
        </Card>
      </div>
    </form>
  );
}
