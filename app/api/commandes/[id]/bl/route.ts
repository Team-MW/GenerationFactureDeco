import { signedCopy } from "@/lib/orders/logic";
import { renderDeliveryNote } from "@/lib/orders/pdf";
import { loadDb, loadDbFresh } from "@/lib/orders/store";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = (await loadDb()).orders.find((o) => o.id === id) ?? (await loadDbFresh()).orders.find((o) => o.id === id);
  if (!order) return new Response("Commande introuvable", { status: 404 });
  // ?signe : le bon tel que le client l'a signé, même si la commande a été modifiée depuis.
  const signed = new URL(request.url).searchParams.has("signe") && Boolean(order.signature);
  const pdf = await renderDeliveryNote(signed ? signedCopy(order) : order, await getSettings());
  const name = encodeURIComponent(`${order.number}${signed ? " signé" : ""} - ${order.customer.name.replace(/[\\/:*?"<>|]/g, " ")}.pdf`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${new URL(request.url).searchParams.has("telecharger") ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "Cache-Control": "no-store",
    },
  });
}
