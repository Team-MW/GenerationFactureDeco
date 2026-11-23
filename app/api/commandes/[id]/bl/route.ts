import { renderDeliveryNote } from "@/lib/orders/pdf";
import { loadDb, loadDbFresh } from "@/lib/orders/store";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = (await loadDb()).orders.find((o) => o.id === id) ?? (await loadDbFresh()).orders.find((o) => o.id === id);
  if (!order) return new Response("Commande introuvable", { status: 404 });
  const pdf = await renderDeliveryNote(order, await getSettings());
  const name = encodeURIComponent(`${order.number} - ${order.customer.name.replace(/[\\/:*?"<>|]/g, " ")}.pdf`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${new URL(request.url).searchParams.has("telecharger") ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "Cache-Control": "no-store",
    },
  });
}
