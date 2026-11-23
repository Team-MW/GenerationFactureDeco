import { ArrowLeft, Check, Download, Hourglass, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import OrderActions, { PaymentControl } from "@/components/orders/OrderActions";
import { PreparedBadge, StageBadge, StockBadge, Warning } from "@/components/orders/bits";
import { Card, CardHeader, buttonSecondary } from "@/components/ui";
import { dateFr, eur } from "@/lib/format";
import { DELIVERY_MODES, PAYMENT_METHODS, SHOPS, timeLabel, fullAddress, isPickup, isStockComplete, orderTotals } from "@/lib/orders/logic";
import { loadDb } from "@/lib/orders/store";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = (await loadDb()).orders.find((o) => o.id === id);
  if (!order) notFound();
  const totals = orderTotals(order);
  const mode = DELIVERY_MODES[order.delivery.mode];
  const pickup = isPickup(order);
  const address = fullAddress(order);

  return (
    <>
      <Link href="/commandes" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft size={16} /> Toutes les commandes
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">{order.number}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {order.customer.name} · créé le {when(order.createdAt)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StageBadge order={order} />
            <StockBadge order={order} />
            <PreparedBadge order={order} />
          </div>
        </div>
        <a href={`/api/commandes/${order.id}/bl?telecharger`} className={buttonSecondary}>
          <Download size={16} /> Télécharger le bon de commande
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {order.status === "active" ? (
            <Card className="p-4 md:p-5">
              {order.scheduledDate && !isStockComplete(order) ? (
                <div className="mb-4">
                  <Warning>Une date est fixée mais un article manque encore en stock.</Warning>
                </div>
              ) : null}
              <OrderActions order={order} />
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <CardHeader title="Articles" />
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {order.lines.map((line) => (
                <li key={line.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">{line.name}</div>
                    <div className="tabular text-xs text-slate-500">
                      {line.reference ? `${line.reference} · ` : ""}
                      {line.quantity} × {eur(line.unitPrice)}
                    </div>
                  </div>
                  {order.status !== "active" ? null : line.reserved ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      <Check size={12} strokeWidth={2.5} /> En stock
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      <Hourglass size={12} /> En attente
                    </span>
                  )}
                  <div className="tabular w-24 shrink-0 text-right text-sm font-semibold text-slate-900">{eur(line.unitPrice * line.quantity)}</div>
                </li>
              ))}
              <li className="flex items-center gap-3 px-4 py-3 md:px-5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{mode.label}</div>
                  <div className="tabular text-xs text-slate-500">
                    {pickup
                      ? "Sans frais"
                      : order.delivery.offered
                        ? `Offerte (valeur ${eur(Math.max(0, order.delivery.basePrice + order.delivery.adjustment))})`
                        : order.delivery.adjustment > 0
                          ? `${eur(order.delivery.basePrice)} + supplément ${eur(order.delivery.adjustment)}`
                          : order.delivery.adjustment < 0
                            ? `${eur(order.delivery.basePrice)} − remise ${eur(-order.delivery.adjustment)}`
                            : "Tarif de base"}
                  </div>
                </div>
                <div className="tabular w-24 shrink-0 text-right text-sm font-semibold text-slate-900">
                  {!pickup && order.delivery.offered ? "Offerte" : eur(totals.delivery)}
                </div>
              </li>
              {order.extras.map((extra) => (
                <li key={extra.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">{extra.label}</div>
                    <div className="tabular text-xs text-slate-500">Prestation ajoutée le {when(extra.at)}</div>
                  </div>
                  <div className="tabular w-24 shrink-0 text-right text-sm font-semibold text-slate-900">{eur(extra.amount)}</div>
                </li>
              ))}
            </ul>
            <dl className="tabular flex flex-col gap-1.5 border-t border-slate-200 bg-slate-50 px-4 py-4 text-sm md:px-5">
              <div className="flex justify-between">
                <dt className="text-slate-500">Articles</dt>
                <dd>{eur(totals.subtotal)}</dd>
              </div>
              {totals.discount > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Réduction{order.discount.type === "percent" ? ` (${order.discount.value} %)` : ""}</dt>
                  <dd>− {eur(totals.discount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-slate-500">Livraison</dt>
                <dd>{!pickup && order.delivery.offered ? "Offerte" : eur(totals.delivery)}</dd>
              </div>
              {totals.extras > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Prestations ajoutées</dt>
                  <dd>{eur(totals.extras)}</dd>
                </div>
              ) : null}
              <div className="mt-1 flex items-baseline justify-between border-t border-slate-200 pt-2">
                <dt className="font-semibold text-slate-900">Total TTC</dt>
                <dd className="text-lg font-semibold text-slate-900">{eur(totals.total)}</dd>
              </div>
            </dl>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Bon de commande" hint="Généré automatiquement · recto commande, verso conditions générales" />
            <iframe src={`/api/commandes/${order.id}/bl#view=FitH&toolbar=1`} title={`Bon de commande ${order.number}`} className="mt-3 h-[640px] w-full border-t border-slate-100 bg-slate-100" />
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4 md:p-5">
            <h2 className="text-sm font-semibold text-slate-900">Client</h2>
            <div className="mt-3 text-sm font-medium text-slate-900">{order.customer.name}</div>
            {order.customer.phone ? (
              <a href={`tel:${order.customer.phone.replace(/\s/g, "")}`} className="mt-1.5 flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                <Phone size={15} className="text-slate-400" /> {order.customer.phone}
              </a>
            ) : null}
            {address ? (
              <div className="mt-1.5 flex items-start gap-2 text-sm text-slate-600">
                <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" /> {address}
              </div>
            ) : null}
            {order.customer.email ? <div className="mt-1.5 break-all text-sm text-slate-600">{order.customer.email}</div> : null}
            {order.customer.notes ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{order.customer.notes}</p> : null}
            <dl className="mt-4 border-t border-slate-100 pt-3 text-sm">
              <dt className="text-xs text-slate-500">{pickup ? "Retrait" : "Livraison"}</dt>
              <dd className="font-medium text-slate-900">
                {order.scheduledDate ? `${dateFr(order.scheduledDate)} · ${timeLabel(order)}` : "À programmer"}
              </dd>
              <dt className="mt-2 text-xs text-slate-500">Magasin</dt>
              <dd className="font-medium text-slate-900">{SHOPS[order.shop].label}</dd>
              {order.observations ? (
                <>
                  <dt className="mt-2 text-xs text-slate-500">Observations et délais</dt>
                  <dd className="text-slate-900">{order.observations}</dd>
                </>
              ) : null}
            </dl>
          </Card>

          <Card className="p-4 md:p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Paiement</h2>
            <PaymentControl order={order} />
            {order.payments.length > 0 ? (
              <ul className="tabular mt-4 flex flex-col gap-1.5 border-t border-slate-100 pt-3 text-sm">
                {order.payments.map((payment, index) => (
                  <li key={index} className="flex justify-between gap-3">
                    <span className="text-slate-600">
                      {when(payment.at)} · {payment.by === "livreur" ? "livreur" : "magasin"}
                      {payment.method ? ` · ${PAYMENT_METHODS[payment.method].toLowerCase()}` : ""}
                    </span>
                    <span className="font-medium text-slate-900">{eur(payment.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card className="p-4 md:p-5">
            <h2 className="text-sm font-semibold text-slate-900">Historique</h2>
            <ol className="mt-3 flex flex-col gap-3">
              {[...order.history].reverse().map((entry, index) => (
                <li key={index} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                  <span>
                    <span className="block text-slate-900">{entry.text}</span>
                    <span className="tabular text-xs text-slate-500">{when(entry.at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
