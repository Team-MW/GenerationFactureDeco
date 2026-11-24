import { CheckCircle2, Download, FileText } from "lucide-react";
import SignaturePad from "@/components/orders/SignaturePad";
import { eur } from "@/lib/format";
import { DELIVERY_MODES, isPickup, orderBalance, orderTotals, signatureMatches, signedCopy } from "@/lib/orders/logic";
import { findBySignToken } from "@/lib/orders/signature";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signature du bon de commande", robots: { index: false, follow: false } };

const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Page ouverte au client par le lien de l'e-mail : il consulte son bon de commande et le signe. */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [found, settings] = await Promise.all([findBySignToken(token), getSettings()]);
  const contact = [settings.phone, settings.email].filter(Boolean).join(" · ");

  const frame = (children: React.ReactNode) => (
    <main className="min-h-full bg-slate-100 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="rounded-t-2xl px-5 py-4 text-lg font-bold tracking-wide text-white" style={{ background: settings.accentColor }}>
          {settings.companyName}
        </div>
        <div className="rounded-b-2xl bg-white px-5 py-6 shadow-sm">{children}</div>
        {contact ? <p className="mt-4 text-center text-xs text-slate-500">Une question ? {contact}</p> : null}
      </div>
    </main>
  );

  if (!found || found.order.status === "cancelled") {
    return frame(
      <>
        <h1 className="text-xl font-semibold text-slate-900">Lien non valable</h1>
        <p className="mt-2 text-sm text-slate-600">Ce lien de signature n&apos;existe pas ou n&apos;est plus actif. Contactez le magasin pour recevoir un nouveau lien.</p>
      </>,
    );
  }

  // Déjà signé et inchangé : on montre le bon signé. Modifié depuis : le client signe la nouvelle version.
  const signed = Boolean(found.order.signature) && signatureMatches(found.order);
  const order = signed ? signedCopy(found.order) : found.order;
  const balance = orderBalance(order);
  const totals = orderTotals(order);
  const pdf = `/api/signer/${token}/bl`;

  return frame(
    <>
      {signed ? (
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0" />
          <div>
            <h1 className="text-base font-semibold">Bon de commande signé</h1>
            <p className="text-sm">Merci {order.customer.name}. Signature enregistrée le {when(found.order.signature!.at)}.</p>
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-slate-900">Signez votre bon de commande</h1>
          <p className="mt-1 text-sm text-slate-600">Bonjour {order.customer.name}, vérifiez votre commande puis signez en bas de la page.</p>
        </>
      )}

      <div className="mt-5 rounded-xl border border-slate-200">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-900">Commande {order.number}</span>
          <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-slate-900 underline underline-offset-4">
            <FileText size={15} /> Voir le bon (PDF)
          </a>
        </div>
        <ul className="divide-y divide-slate-100 px-4">
          {order.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 py-2.5 text-sm">
              <span className="text-slate-700">
                {line.quantity} × {line.name}
              </span>
              <span className="tabular shrink-0 font-medium text-slate-900">{eur(line.unitPrice * line.quantity)}</span>
            </li>
          ))}
          {totals.discount > 0 ? (
            <li className="flex justify-between gap-3 py-2.5 text-sm">
              <span className="text-slate-700">Réduction</span>
              <span className="tabular shrink-0 font-medium text-slate-900">− {eur(totals.discount)}</span>
            </li>
          ) : null}
          <li className="flex justify-between gap-3 py-2.5 text-sm">
            <span className="text-slate-700">{DELIVERY_MODES[order.delivery.mode].label}</span>
            <span className="tabular shrink-0 font-medium text-slate-900">{isPickup(order) ? "Sans frais" : order.delivery.offered ? "Offerte" : eur(totals.delivery)}</span>
          </li>
          {order.extras.map((extra) => (
            <li key={extra.id} className="flex justify-between gap-3 py-2.5 text-sm">
              <span className="text-slate-700">{extra.label}</span>
              <span className="tabular shrink-0 font-medium text-slate-900">{eur(extra.amount)}</span>
            </li>
          ))}
        </ul>
        <dl className="tabular flex flex-col gap-1.5 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="font-semibold text-slate-900">Total TTC</dt>
            <dd className="font-semibold text-slate-900">{eur(balance.total)}</dd>
          </div>
          {balance.paid > 0 ? (
            <div className="flex justify-between text-slate-600">
              <dt>Déjà réglé</dt>
              <dd>{eur(balance.paid)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-slate-600">
            <dt>Reste à payer</dt>
            <dd>{eur(balance.rest)}</dd>
          </div>
        </dl>
      </div>

      {signed ? (
        <a href={`${pdf}?telecharger`} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-800">
          <Download size={16} /> Télécharger mon bon signé
        </a>
      ) : (
        <div className="mt-6">
          <SignaturePad token={token} />
        </div>
      )}
    </>,
  );
}
