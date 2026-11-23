import JSZip from "jszip";
import { getDataset } from "@/lib/data";
import { getInvoicePdf, invoiceFileName, monthFolder } from "@/lib/generate";

export const dynamic = "force-dynamic";

/** Archive ZIP des factures d'un mois (?mois=2026-01) ou de toutes les factures. */
export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("mois");
  const invoices = getDataset().invoices.filter((i) => !month || i.month === month);
  if (invoices.length === 0) return new Response("Aucune facture", { status: 404 });

  const zip = new JSZip();
  for (const invoice of invoices) {
    const folder = month ? zip : zip.folder(monthFolder(invoice.month))!;
    folder.file(invoiceFileName(invoice), await getInvoicePdf(invoice));
  }
  const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const name = encodeURIComponent(month ? `Factures ${monthFolder(month)}.zip` : "Factures.zip");
  return new Response(archive as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
      "Cache-Control": "no-store",
    },
  });
}
