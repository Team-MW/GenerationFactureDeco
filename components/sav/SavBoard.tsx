"use client";

import { Ban, CalendarClock, Check, ChevronDown, ChevronRight, Loader2, MapPin, PencilLine, Phone, Plus, Save, Search, Trash2, Undo2, Wrench, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cancelSavTicket, closeSavTicket, deleteSavTicket, reopenSavTicket, saveSavTicket, scheduleSavVisit } from "@/app/sav/actions";
import { dateFr } from "@/lib/format";
import { dayLabel, hourLabel } from "@/lib/orders/logic";
import { SAV_KINDS, SAV_STATUS, savAddress, type SavCustomer, type SavKind, type SavStatus, type SavTicket } from "@/lib/sav/types";
import { confirmDialog } from "../ConfirmDialog";
import { useAction } from "../orders/OrderActions";
import { EmptyState, MomentSelect, inputClass } from "../orders/bits";
import { Card, buttonPrimary, buttonSecondary } from "../ui";

/** Bon de commande proposé pour pré-remplir une demande. */
export interface SavOrder {
  number: string;
  customer: SavCustomer;
  products: string[];
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const momentLabel = (moment: string) => (moment === "matin" ? "Matin" : moment === "apres-midi" ? "Après-midi" : moment ? hourLabel(moment) : "Journée");
const EMPTY_CUSTOMER: SavCustomer = { name: "", phone: "", email: "", address: "", postalCode: "", city: "" };
const labelClass = "mb-1 block text-xs font-medium text-slate-700";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </Card>
  );
}

function StatusBadge({ status }: { status: SavStatus }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${SAV_STATUS[status].style}`}>{SAV_STATUS[status].label}</span>;
}

/** Formulaire d'une demande : client, produit, problème. Un bon de commande existant peut pré-remplir le client. */
function TicketForm({ ticket, orders, onClose }: { ticket?: SavTicket; orders: SavOrder[]; onClose: () => void }) {
  const { pending, run } = useAction();
  const [customer, setCustomer] = useState<SavCustomer>(ticket?.customer ?? EMPTY_CUSTOMER);
  const [orderNumber, setOrderNumber] = useState(ticket?.orderNumber ?? "");
  const [product, setProduct] = useState(ticket?.product ?? "");
  const [kind, setKind] = useState<SavKind>(ticket?.kind ?? "reparation");
  const [problem, setProblem] = useState(ticket?.problem ?? "");
  const [search, setSearch] = useState("");
  const set = (field: keyof SavCustomer) => (event: React.ChangeEvent<HTMLInputElement>) => setCustomer((current) => ({ ...current, [field]: event.target.value }));

  const matches = useMemo(() => {
    const words = normalize(search.trim()).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return orders.filter((order) => words.every((word) => normalize(`${order.number} ${order.customer.name} ${order.customer.phone} ${order.customer.city}`).includes(word))).slice(0, 6);
  }, [search, orders]);
  const linked = orders.find((order) => order.number === orderNumber);

  const pick = (order: SavOrder) => {
    setCustomer(order.customer);
    setOrderNumber(order.number);
    if (!product && order.products.length === 1) setProduct(order.products[0]);
    setSearch("");
  };

  return (
    <form
      className="space-y-4 border-b border-slate-100 bg-slate-50 p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        run(async () => {
          const result = await saveSavTicket({ id: ticket?.id, customer, orderNumber, product, kind, problem });
          if (result.ok) onClose();
          return result;
        }, ticket ? "Demande modifiée" : "Demande enregistrée");
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">{ticket ? `Modifier la demande ${ticket.number}` : "Nouvelle demande de SAV"}</h2>
        <button type="button" onClick={onClose} aria-label="Fermer le formulaire" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-200">
          <X size={16} />
        </button>
      </div>

      {orders.length > 0 ? (
        <div>
          <span className={labelClass}>Retrouver le client dans les bons de commande (facultatif)</span>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-9`} aria-label="Chercher un bon de commande" placeholder="Nom, téléphone ou numéro de bon" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {matches.length > 0 ? (
            <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {matches.map((order) => (
                <li key={order.number}>
                  <button type="button" onClick={() => pick(order)} className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-left text-sm hover:bg-slate-50">
                    <span className="font-medium text-slate-900">{order.customer.name}</span>
                    <span className="text-xs text-slate-500">{order.number}</span>
                    <span className="w-full truncate text-xs text-slate-500">{order.products.join(", ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : search.trim() ? (
            <p className="mt-2 text-xs text-slate-500">Aucun bon de commande ne correspond. Saisissez le client à la main ci-dessous.</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label>
          <span className={labelClass}>Nom du client</span>
          <input className={inputClass} value={customer.name} onChange={set("name")} required autoFocus={!ticket} />
        </label>
        <label>
          <span className={labelClass}>Téléphone</span>
          <input className={inputClass} type="tel" inputMode="tel" value={customer.phone} onChange={set("phone")} />
        </label>
        <label>
          <span className={labelClass}>E-mail (facultatif)</span>
          <input className={inputClass} type="email" value={customer.email} onChange={set("email")} />
        </label>
        <label className="sm:col-span-2 lg:col-span-1">
          <span className={labelClass}>Adresse du rendez-vous</span>
          <input className={inputClass} value={customer.address} onChange={set("address")} />
        </label>
        <label>
          <span className={labelClass}>Code postal</span>
          <input className={inputClass} inputMode="numeric" value={customer.postalCode} onChange={set("postalCode")} />
        </label>
        <label>
          <span className={labelClass}>Ville</span>
          <input className={inputClass} value={customer.city} onChange={set("city")} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label>
          <span className={labelClass}>Type de demande</span>
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as SavKind)}>
            {(Object.keys(SAV_KINDS) as SavKind[]).map((value) => (
              <option key={value} value={value}>
                {SAV_KINDS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Produit concerné</span>
          <input className={inputClass} list="sav-produits" placeholder="Ex. : canapé Bodrum" value={product} onChange={(e) => setProduct(e.target.value)} />
          <datalist id="sav-produits">{linked?.products.map((name) => <option key={name} value={name} />)}</datalist>
        </label>
        <label>
          <span className={labelClass}>Bon de commande (facultatif)</span>
          <input className={inputClass} placeholder="Ex. : BL-2026-0012" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>Problème signalé par le client</span>
        <textarea className={`${inputClass} min-h-[96px]`} placeholder="Ce qui ne va pas, depuis quand, ce que le client attend…" value={problem} onChange={(e) => setProblem(e.target.value)} required />
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonSecondary}>
          Annuler
        </button>
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {ticket ? "Enregistrer" : "Enregistrer la demande"}
        </button>
      </div>
    </form>
  );
}

/** Prise de rendez-vous chez le client : date, heure, intervenant, consigne. */
function VisitForm({ ticket, today }: { ticket: SavTicket; today: string }) {
  const { pending, run } = useAction();
  const [date, setDate] = useState(ticket.visitDate ?? "");
  const [moment, setMoment] = useState(ticket.visitMoment);
  const [technician, setTechnician] = useState(ticket.technician);
  const [note, setNote] = useState(ticket.visitNote);
  const changed = date !== (ticket.visitDate ?? "") || moment !== ticket.visitMoment || technician !== ticket.technician || note !== ticket.visitNote;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <CalendarClock size={14} /> Rendez-vous chez le client
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          <span className={labelClass}>Date</span>
          <input type="date" className={inputClass} min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Heure</span>
          <MomentSelect value={moment} onChange={setMoment} />
        </label>
        <label>
          <span className={labelClass}>Qui y va (facultatif)</span>
          <input className={inputClass} placeholder="Nom de l'intervenant" value={technician} onChange={(e) => setTechnician(e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>À prévoir (facultatif)</span>
          <input className={inputClass} placeholder="Pièce, outil, digicode…" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={pending || !date || !changed} onClick={() => run(() => scheduleSavVisit(ticket.id, date, moment, technician, note), ticket.visitDate ? "Rendez-vous modifié" : "Rendez-vous fixé")} className={buttonPrimary}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
          {ticket.visitDate ? "Modifier le rendez-vous" : "Fixer le rendez-vous"}
        </button>
        {ticket.visitDate ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setDate("");
              setMoment("");
              run(() => scheduleSavVisit(ticket.id, null, "", "", ""), "Rendez-vous retiré");
            }}
            className={buttonSecondary}
          >
            <Undo2 size={16} /> Retirer le rendez-vous
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Une demande : résumé toujours visible, détail et actions quand on l'ouvre. */
function TicketCard({ ticket, orders, today, open, onToggle }: { ticket: SavTicket; orders: SavOrder[]; today: string; open: boolean; onToggle: () => void }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [report, setReport] = useState(ticket.report);
  const address = savAddress(ticket.customer);
  const closed = ticket.status === "terminee" || ticket.status === "annulee";
  const late = ticket.status === "planifiee" && ticket.visitDate !== null && ticket.visitDate < today;

  return (
    <li id={`sav-${ticket.id}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50/70 sm:px-5">
        <span className="mt-0.5 text-slate-400">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-slate-900">{ticket.customer.name}</span>
            <span className="text-xs text-slate-500">{ticket.number}</span>
            <StatusBadge status={ticket.status} />
            {late ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">Date dépassée</span> : null}
          </span>
          <span className="mt-0.5 block truncate text-sm text-slate-600">
            {SAV_KINDS[ticket.kind]}
            {ticket.product ? ` · ${ticket.product}` : ""} · {ticket.problem}
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {ticket.status === "planifiee" && ticket.visitDate
              ? `Rendez-vous : ${dayLabel(ticket.visitDate, today)} · ${momentLabel(ticket.visitMoment)}${ticket.technician ? ` · ${ticket.technician}` : ""}`
              : `Demande du ${dateFr(ticket.createdAt.slice(0, 10))}${ticket.customer.city ? ` · ${ticket.customer.city}` : ""}`}
          </span>
        </span>
      </button>

      {open ? (
        editing ? (
          <TicketForm ticket={ticket} orders={orders} onClose={() => setEditing(false)} />
        ) : (
          <div className="space-y-3 border-t border-slate-100 bg-slate-50 px-4 py-4 sm:px-5">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="space-y-1.5">
                {ticket.customer.phone ? (
                  <a href={`tel:${ticket.customer.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 font-medium text-slate-900 underline decoration-slate-300 underline-offset-4">
                    <Phone size={14} className="text-slate-500" /> {ticket.customer.phone}
                  </a>
                ) : (
                  <div className="flex items-center gap-2 text-slate-500">
                    <Phone size={14} /> Téléphone non renseigné
                  </div>
                )}
                {address ? (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-slate-700 underline decoration-slate-300 underline-offset-4">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-slate-500" /> {address}
                  </a>
                ) : (
                  <div className="flex items-center gap-2 text-slate-500">
                    <MapPin size={14} /> Adresse non renseignée
                  </div>
                )}
                {ticket.customer.email ? <div className="pl-[22px] text-slate-600">{ticket.customer.email}</div> : null}
                {ticket.orderNumber ? <div className="pl-[22px] text-xs text-slate-500">Bon de commande {ticket.orderNumber}</div> : null}
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Problème signalé</div>
                <p className="mt-1 whitespace-pre-wrap text-slate-800">{ticket.problem}</p>
              </div>
            </div>

            {ticket.report ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <div className="text-xs font-semibold uppercase tracking-wide">Compte rendu</div>
                <p className="mt-0.5 whitespace-pre-wrap">{ticket.report}</p>
              </div>
            ) : null}

            {closed ? null : <VisitForm key={`${ticket.visitDate}-${ticket.visitMoment}`} ticket={ticket} today={today} />}

            {closing ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <label className="block">
                  <span className={labelClass}>Compte rendu : ce qui a été fait (facultatif)</span>
                  <textarea className={`${inputClass} min-h-[80px]`} placeholder="Ex. : pied remplacé, client satisfait" value={report} onChange={(e) => setReport(e.target.value)} autoFocus />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const result = await closeSavTicket(ticket.id, report);
                        if (result.ok) setClosing(false);
                        return result;
                      }, "Demande terminée")
                    }
                    className={buttonPrimary}
                  >
                    {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Confirmer
                  </button>
                  <button type="button" onClick={() => setClosing(false)} className={buttonSecondary}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {closed ? (
                  <button type="button" disabled={pending} onClick={() => run(() => reopenSavTicket(ticket.id), "Demande rouverte")} className={buttonSecondary}>
                    <Undo2 size={16} /> Rouvrir
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => setClosing(true)} className={buttonSecondary}>
                      <Check size={16} /> Terminer la demande
                    </button>
                    <button type="button" onClick={() => setEditing(true)} className={buttonSecondary}>
                      <PencilLine size={16} /> Modifier
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={async () => {
                        if (await confirmDialog({ title: `Annuler la demande ${ticket.number} ?`, message: "Elle reste visible dans les demandes closes et peut être rouverte.", confirmLabel: "Annuler la demande", cancelLabel: "Retour" })) run(() => cancelSavTicket(ticket.id), "Demande annulée");
                      }}
                      className={buttonSecondary}
                    >
                      <Ban size={16} /> Annuler la demande
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={async () => {
                    if (await confirmDialog({ title: `Supprimer la demande ${ticket.number} ?`, message: "Elle disparaît définitivement, avec son historique.", confirmLabel: "Supprimer", tone: "danger" })) run(() => deleteSavTicket(ticket.id), "Demande supprimée");
                  }}
                  className={`${buttonSecondary} text-rose-700`}
                >
                  <Trash2 size={16} /> Supprimer
                </button>
              </div>
            )}

            {ticket.history.length > 0 ? (
              <ul className="space-y-0.5 text-xs text-slate-500">
                {ticket.history.slice(-6).map((entry, index) => (
                  <li key={index}>
                    {dateFr(entry.at.slice(0, 10))} · {entry.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      ) : null}
    </li>
  );
}

type Filter = "en-cours" | SavStatus | "toutes";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "en-cours", label: "En cours" },
  { key: "nouvelle", label: "Rendez-vous à fixer" },
  { key: "planifiee", label: "Rendez-vous fixés" },
  { key: "terminee", label: "Terminées" },
  { key: "annulee", label: "Annulées" },
  { key: "toutes", label: "Toutes" },
];

/** Tableau du SAV : les chiffres du moment, les prochains rendez-vous, puis toutes les demandes. */
export default function SavBoard({ tickets, orders, today }: { tickets: SavTicket[]; orders: SavOrder[]; today: string }) {
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("en-cours");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const count = (status: SavStatus) => tickets.filter((t) => t.status === status).length;
  const visits = useMemo(
    () => tickets.filter((t) => t.status === "planifiee" && t.visitDate).sort((a, b) => `${a.visitDate} ${a.visitMoment === "apres-midi" ? "13:00" : a.visitMoment === "matin" ? "08:00" : a.visitMoment || "00:00"}`.localeCompare(`${b.visitDate} ${b.visitMoment === "apres-midi" ? "13:00" : b.visitMoment === "matin" ? "08:00" : b.visitMoment || "00:00"}`)),
    [tickets],
  );
  const list = useMemo(() => {
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    return tickets
      .filter((t) => (filter === "toutes" ? true : filter === "en-cours" ? t.status === "nouvelle" || t.status === "planifiee" : t.status === filter))
      .filter((t) => words.every((word) => normalize(`${t.number} ${t.customer.name} ${t.customer.phone} ${t.customer.city} ${t.product} ${t.problem} ${t.orderNumber}`).includes(word)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [tickets, filter, query]);
  const nextVisit = visits.find((t) => (t.visitDate ?? "") >= today);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Rendez-vous à fixer" value={String(count("nouvelle"))} hint="demandes en attente d'une date" />
        <Tile label="Rendez-vous fixés" value={String(count("planifiee"))} hint={nextVisit?.visitDate ? `prochain : ${dayLabel(nextVisit.visitDate, today)}` : "aucun à venir"} />
        <Tile label="Aujourd'hui" value={String(visits.filter((t) => t.visitDate === today).length)} hint="rendez-vous du jour" />
        <Tile label="Terminées" value={String(count("terminee"))} hint={`sur ${tickets.length} demande${tickets.length > 1 ? "s" : ""}`} />
      </div>

      {visits.length > 0 ? (
        <Card>
          <div className="px-4 pt-4 sm:px-5">
            <h2 className="text-sm font-semibold text-slate-900">Prochains rendez-vous</h2>
            <p className="mt-0.5 text-xs text-slate-500">Dans l&apos;ordre des dates · cliquez pour ouvrir la demande</p>
          </div>
          <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
            {visits.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("en-cours");
                    setQuery("");
                    setOpenId(ticket.id);
                    requestAnimationFrame(() => document.getElementById(`sav-${ticket.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
                  }}
                  className="flex w-full flex-wrap items-baseline gap-x-4 gap-y-0.5 px-4 py-2.5 text-left text-sm hover:bg-slate-50/70 sm:px-5"
                >
                  <span className={`w-full font-medium sm:w-64 ${(ticket.visitDate ?? "") < today ? "text-rose-700" : "text-slate-900"}`}>
                    {dayLabel(ticket.visitDate!, today)} · {momentLabel(ticket.visitMoment)}
                  </span>
                  <span className="text-slate-900">{ticket.customer.name}</span>
                  <span className="text-slate-500">{[ticket.customer.city, ticket.product, ticket.technician].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 sm:px-5">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-9`} aria-label="Chercher une demande" placeholder="Chercher un client, un produit, un numéro…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="min-w-[150px] flex-1 sm:w-52 sm:flex-none">
            <select className={inputClass} aria-label="Filtrer les demandes" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              {FILTERS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => setCreating(true)} disabled={creating} className={`${buttonPrimary} shrink-0`}>
            <Plus size={16} /> Nouvelle demande
          </button>
        </div>

        {creating ? <TicketForm orders={orders} onClose={() => setCreating(false)} /> : null}

        {list.length === 0 ? (
          creating ? null : (
            <EmptyState
              icon={<Wrench size={24} />}
              title={tickets.length === 0 ? "Aucune demande de SAV" : "Aucune demande ici"}
              text={tickets.length === 0 ? "Quand un client signale un problème, enregistrez sa demande ici, puis fixez un rendez-vous chez lui." : "Changez le filtre ou la recherche pour voir les autres demandes."}
            >
              {tickets.length === 0 ? (
                <button type="button" onClick={() => setCreating(true)} className={buttonPrimary}>
                  <Plus size={16} /> Nouvelle demande
                </button>
              ) : null}
            </EmptyState>
          )
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} orders={orders} today={today} open={openId === ticket.id} onToggle={() => setOpenId(openId === ticket.id ? null : ticket.id)} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
