import { findInvoice } from "@/lib/data";
import { getInvoicePdf, invoiceFileName } from "@/lib/generate";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = findInvoice(id);
  if (!invoice) return new Response("Facture introuvable", { status: 404 });
  const pdf = await getInvoicePdf(invoice);
  const download = new URL(request.url).searchParams.has("telecharger");
  const fileName = encodeURIComponent(invoiceFileName(invoice));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${fileName}`,
      "Cache-Control": "no-store",
    },
  });
}
