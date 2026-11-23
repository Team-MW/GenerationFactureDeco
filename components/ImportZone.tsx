"use client";

import { AlertTriangle, FileSpreadsheet, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast, uploadFiles } from "@/lib/client";
import { eur, monthLabel } from "@/lib/format";
import type { SourceFile } from "@/lib/types";
import { Card, CardHeader } from "./ui";

const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

export default function ImportZone({ files }: { files: SourceFile[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const send = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    const imported = await uploadFiles([...list]);
    setBusy(false);
    if (input.current) input.current.value = "";
    if (imported) router.refresh();
  };

  const remove = async (file: SourceFile) => {
    const warning =
      `Retirer « ${file.name} » ?\n\n` +
      `Ses ${file.invoices} factures disparaîtront de l'application. ` +
      `Le fichier est déplacé dans data/.corbeille et peut être restauré.`;
    if (!window.confirm(warning)) return;
    const response = await fetch(`/api/fichiers?nom=${encodeURIComponent(file.name)}`, { method: "DELETE" });
    if (response.ok) {
      toast(`${file.name} retiré`, "info");
      router.refresh();
    } else {
      toast("Suppression impossible", "error");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="group flex w-full flex-col items-center rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center transition hover:border-brand hover:bg-brand-soft"
      >
        <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand transition group-hover:bg-white">
          {busy ? <Loader2 size={26} className="animate-spin" /> : <UploadCloud size={26} strokeWidth={1.6} />}
        </span>
        <span className="mt-4 text-base font-semibold text-slate-900">
          {busy ? "Import en cours…" : "Glissez vos fichiers ici, ou cliquez pour les choisir"}
        </span>
        <span className="mt-1 text-sm text-slate-500">
          CSV, XLSX ou XLS · plusieurs fichiers à la fois · les factures sont générées immédiatement
        </span>
        <input
          ref={input}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => send(e.target.files)}
        />
      </button>

      <Card className="mt-4 overflow-hidden">
        <CardHeader title="Fichiers importés" hint={`${files.length} fichier${files.length > 1 ? "s" : ""} dans le dossier data/`} />
        {files.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Aucun fichier pour l&apos;instant.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium">Fichier</th>
                  <th className="px-3 py-2.5 text-left font-medium">Période</th>
                  <th className="px-3 py-2.5 text-right font-medium">Lignes</th>
                  <th className="px-3 py-2.5 text-right font-medium">Factures</th>
                  <th className="px-3 py-2.5 text-right font-medium">Retenues</th>
                  <th className="px-3 py-2.5 text-right font-medium">Montant facturé</th>
                  <th className="w-12 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {files.map((file) => (
                  <tr key={file.name} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet size={18} className="shrink-0 text-emerald-600" strokeWidth={1.7} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">{file.name}</div>
                          <div className="text-xs text-slate-400">{size(file.size)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {file.error ? (
                        <span className="inline-flex items-center gap-1.5 text-rose-700">
                          <AlertTriangle size={14} /> {file.error}
                        </span>
                      ) : (
                        file.months.map(monthLabel).join(", ") || "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{file.rows}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                      {file.invoices}
                      {file.duplicates ? (
                        <span className="ml-1 text-xs font-normal text-slate-400">({file.duplicates} doublons ignorés)</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{file.retentions || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-900">{eur(file.total)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => remove(file)}
                        title="Retirer ce fichier"
                        className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
