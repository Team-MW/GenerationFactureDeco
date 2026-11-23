import { FolderOpen } from "lucide-react";
import ImportZone from "@/components/ImportZone";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { getDataset } from "@/lib/data";
import { dateFr, eur } from "@/lib/format";
import { DATA_DIR, OUTPUT_DIR } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { files, retentions } = await getDataset();
  return (
    <>
      <PageHeader title="Import des fichiers" subtitle="Une facture est créée pour chaque ligne de vente de vos fichiers" />
      <ImportZone files={files} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Dossiers locaux" hint="Utilisés sur cet ordinateur uniquement" />
          <dl className="flex flex-col gap-3 p-5 text-sm">
            {[
              ["Fichiers source (CSV / Excel)", DATA_DIR],
              ["Factures PDF générées", OUTPUT_DIR],
            ].map(([label, dir]) => (
              <div key={dir} className="flex items-start gap-3">
                <FolderOpen size={18} className="mt-0.5 shrink-0 text-slate-400" strokeWidth={1.7} />
                <div className="min-w-0">
                  <dt className="font-medium text-slate-900">{label}</dt>
                  <dd className="break-all font-mono text-xs text-slate-500">{dir}</dd>
                </div>
              </div>
            ))}
            <p className="text-xs leading-relaxed text-slate-500">
              Les fichiers importés sont enregistrés en base de données : factures, numéros et statistiques sont donc
              disponibles partout, y compris en ligne. En local, un fichier déposé directement dans le dossier source est
              importé automatiquement. Une ligne déjà importée n&apos;est jamais facturée deux fois.
            </p>
          </dl>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Retenues sans vente"
            hint="Lignes dont le montant d'origine est nul : aucune facture n'est émise"
          />
          {retentions.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500">Aucune retenue dans les fichiers importés.</p>
          ) : (
            <table className="tabular mt-3 w-full text-sm">
              <tbody className="divide-y divide-slate-100 border-t border-slate-100">
                {retentions.map((r, index) => (
                  <tr key={`${r.ref}-${index}`}>
                    <td className="px-5 py-2.5 text-slate-600">{dateFr(r.date)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900">{r.client}</div>
                      <div className="text-xs text-slate-400">{r.ref}</div>
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium text-slate-900">− {eur(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
