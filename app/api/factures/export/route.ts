import { getDataset } from "@/lib/data";
import { computeTotals, dateFr } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const num = (n: number) => n.toFixed(2).replace(".", ",");
const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Journal des ventes au format CSV (séparateur « ; », lisible par Excel). */
export function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("mois");
  const settings = getSettings();
  const invoices = getDataset().invoices.filter((i) => !month || i.month === month);
  const lines = [
    ["Numéro", "Date", "Client", "Référence dossier", "Total HT", "TVA", "Total TTC", "Commission", "Retenue", "Net encaissé"],
    ...invoices.map((i) => {
      const { ht, vat, ttc } = computeTotals(i.amount, settings);
      return [i.number, dateFr(i.date), i.client, i.ref, num(ht), num(vat), num(ttc), num(i.commission), num(i.retained), num(i.net)];
    }),
  ];
  const csv = "﻿" + lines.map((l) => l.map(cell).join(";")).join("\r\n");
  const name = encodeURIComponent(`Journal des ventes${month ? ` ${month}` : ""}.csv`);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
    },
  });
}
