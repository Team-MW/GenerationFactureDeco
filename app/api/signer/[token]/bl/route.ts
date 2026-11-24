import { signedCopy } from "@/lib/orders/logic";
import { renderDeliveryNote } from "@/lib/orders/pdf";
import { findBySignToken } from "@/lib/orders/signature";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Le bon de commande du client, par son lien de signature : la version signée dès qu'elle existe. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findBySignToken(token);
  if (!found) return new Response("Lien invalide", { status: 404 });
  const order = signedCopy(found.order);
  const pdf = await renderDeliveryNote(order, await getSettings());
  const name = encodeURIComponent(`Bon de commande ${order.number}.pdf`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${new URL(request.url).searchParams.has("telecharger") ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
