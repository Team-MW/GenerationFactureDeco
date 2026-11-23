import { ArrowDownRight, ArrowUpRight, Download, FileText, UploadCloud } from "lucide-react";
import Link from "next/link";
import {
  AverageChart,
  BucketList,
  CommissionChart,
  CountChart,
  CumulativeChart,
  RevenueChart,
  WeekdayChart,
} from "@/components/Charts";
import { Card, CardHeader, PageHeader, buttonPrimary, buttonSecondary } from "@/components/ui";
import { getDataset } from "@/lib/data";
import { dateFr, eur, eur0, pct } from "@/lib/format";
import { computeStats } from "@/lib/stats";
import type { Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

function Delta({ current, previous, versus }: { current: number; previous: number | undefined; versus: string }) {
  if (previous === undefined || previous === 0) return <span className="text-xs text-slate-400">—</span>;
  const change = (current - previous) / previous;
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
      <span
        className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium ${
          up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
        }`}
      >
        <Icon size={12} />
        {up ? "+" : "−"}
        {Math.abs(change * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
      </span>
      {versus}
    </span>
  );
}

function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <Card className="px-4 py-3.5 md:px-5 md:py-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 md:text-xs">{label}</div>
      <div className="tabular mt-2 text-xl font-semibold md:text-[26px] leading-none tracking-tight text-slate-900">{value}</div>
      <div className="mt-3 min-h-5">{children}</div>
    </Card>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-5 py-3.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="tabular mt-0.5 text-base font-semibold text-slate-900">{value}</div>
      {hint ? <div className="text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

function InvoiceRows({ invoices }: { invoices: Invoice[] }) {
  return (
    <ul className="divide-y divide-slate-100 px-5 pb-2 pt-2">
      {invoices.map((invoice) => (
        <li key={invoice.id}>
          <a
            href={`/api/factures/${invoice.id}/pdf`}
            target="_blank"
            className="group flex items-center justify-between gap-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-900 group-hover:text-brand">{invoice.client}</div>
              <div className="tabular text-xs text-slate-500">
                {invoice.number} · {dateFr(invoice.date)}
              </div>
            </div>
            <div className="tabular shrink-0 text-sm font-semibold text-slate-900">{eur(invoice.amount)}</div>
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const dataset = getDataset();
  const stats = computeStats(dataset);

  if (stats.count === 0) {
    return (
      <>
        <PageHeader title="Tableau de bord" />
        <Card className="grid place-items-center px-6 py-20 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand">
            <UploadCloud size={26} strokeWidth={1.6} />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-slate-900">Aucune donnée pour l&apos;instant</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Glissez vos fichiers CSV ou Excel dans cette fenêtre, ou déposez-les dans le dossier{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">data/</code>. Les factures et les statistiques
            apparaîtront automatiquement.
          </p>
          <Link href="/import" className={`${buttonPrimary} mt-6`}>
            <UploadCloud size={16} /> Importer des fichiers
          </Link>
        </Card>
      </>
    );
  }

  const { last, previous, months } = stats;
  const versus = previous ? `vs ${previous.short}` : "";
  const period =
    months.length > 1 ? `${months[0].label} – ${months[months.length - 1].label}` : (months[0]?.label ?? "");

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle={`${period} · ${stats.count} factures · ${dataset.files.length} fichiers`}>
        <a href="/api/factures/export" className={buttonSecondary}>
          <Download size={16} /> Journal des ventes
        </a>
        <Link href="/factures" className={buttonPrimary}>
          <FileText size={16} /> Voir les factures
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Kpi label="Chiffre d'affaires" value={eur0(stats.revenue)}>
          {last ? (
            <Delta current={last.revenue} previous={previous?.revenue} versus={`${last.short} ${versus}`} />
          ) : null}
        </Kpi>
        <Kpi label="Factures émises" value={stats.count.toLocaleString("fr-FR")}>
          {last ? <Delta current={last.count} previous={previous?.count} versus={`${last.short} ${versus}`} /> : null}
        </Kpi>
        <Kpi label="Panier moyen" value={eur0(stats.average)}>
          {last ? (
            <Delta current={last.average} previous={previous?.average} versus={`${last.short} ${versus}`} />
          ) : null}
        </Kpi>
        <Kpi label="Net encaissé" value={eur0(stats.net)}>
          <span className="text-xs text-slate-500">après commissions et retenues</span>
        </Kpi>
      </div>

      <Card className="mt-3 grid grid-cols-2 divide-slate-100 md:mt-4 lg:grid-cols-5 lg:divide-x">
        <Fact label="Commissions" value={eur(stats.commission)} hint={`${pct(stats.rate)} du CA`} />
        <Fact
          label="Retenues"
          value={eur(stats.retained)}
          hint={`${dataset.retentions.length + dataset.invoices.filter((i) => i.retained > 0).length} opérations`}
        />
        <Fact label="Montant médian" value={eur(stats.median)} hint="par facture" />
        <Fact label="Meilleur mois" value={stats.best?.label ?? "—"} hint={stats.best ? eur0(stats.best.revenue) : ""} />
        <Fact label="Clients facturés" value={stats.clients.toLocaleString("fr-FR")} hint="clients distincts" />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Chiffre d'affaires mensuel" hint="Montant total facturé, par mois" />
          <div className="px-3 pb-4 pt-3">
            <RevenueChart months={months} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Répartition des montants" hint="Nombre de factures par tranche" />
          <BucketList buckets={stats.buckets} />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Chiffre d'affaires cumulé" hint="Progression depuis le premier mois" />
          <div className="px-3 pb-4 pt-3">
            <CumulativeChart months={months} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Factures par mois" hint="Volume émis" />
          <div className="px-3 pb-4 pt-3">
            <CountChart months={months} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Panier moyen" hint="Montant moyen par facture" />
          <div className="px-3 pb-4 pt-3">
            <AverageChart months={months} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Commissions retenues" hint="Par mois" />
          <div className="px-3 pb-4 pt-3">
            <CommissionChart months={months} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Activité par jour" hint="Factures selon le jour de la semaine" />
          <div className="px-3 pb-4 pt-3">
            <WeekdayChart weekdays={stats.weekdays} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Plus grosses factures" hint="Sur toute la période" />
          <InvoiceRows invoices={stats.top} />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader title="Synthèse mensuelle" hint="Détail chiffré de chaque mois" />
          <div className="mt-3 overflow-x-auto">
            <table className="tabular w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium">Mois</th>
                  <th className="px-3 py-2.5 text-right font-medium">Factures</th>
                  <th className="px-3 py-2.5 text-right font-medium">CA</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">Panier moyen</th>
                  <th className="px-3 py-2.5 text-right font-medium">Commissions</th>
                  <th className="px-3 py-2.5 text-right font-medium">Retenues</th>
                  <th className="px-5 py-2.5 text-right font-medium">Net</th>
                  <th className="w-10 px-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {months.map((m) => (
                  <tr key={m.month} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-900">
                      <Link href={`/factures?mois=${m.month}`} className="hover:text-brand">
                        {m.label}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{m.count}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-900">{eur(m.revenue)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{eur(m.average)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{eur(m.commission)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{m.retained ? eur(m.retained) : "—"}</td>
                    <td className="px-5 py-2.5 text-right font-medium text-slate-900">{eur(m.net)}</td>
                    <td className="px-2 text-right">
                      <a
                        href={`/api/factures/zip?mois=${m.month}`}
                        title={`Télécharger les factures de ${m.label} (ZIP)`}
                        className="inline-grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Download size={15} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-5 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right">{stats.count}</td>
                  <td className="px-3 py-2.5 text-right">{eur(stats.revenue)}</td>
                  <td className="px-3 py-2.5 text-right">{eur(stats.average)}</td>
                  <td className="px-3 py-2.5 text-right">{eur(stats.commission)}</td>
                  <td className="px-3 py-2.5 text-right">{eur(stats.retained)}</td>
                  <td className="px-5 py-2.5 text-right">{eur(stats.net)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Dernières factures" hint="Les plus récentes" />
          <InvoiceRows invoices={stats.recent} />
        </Card>
      </div>
    </>
  );
}
