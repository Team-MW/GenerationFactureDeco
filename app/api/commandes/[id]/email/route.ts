import { buildEmail, isEmailKind } from "@/lib/orders/emails";
import { signUrl } from "@/lib/orders/signature";
import { loadDb, loadDbFresh } from "@/lib/orders/store";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Aperçu d'un e-mail tel que le client le recevra (rien n'est envoyé). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kind = new URL(request.url).searchParams.get("type");
  if (!isEmailKind(kind)) return new Response("Message inconnu", { status: 400 });
  const order = (await loadDb()).orders.find((o) => o.id === id) ?? (await loadDbFresh()).orders.find((o) => o.id === id);
  if (!order) return new Response("Commande introuvable", { status: 404 });
  if ((kind === "programmation" || kind === "rappel") && !order.scheduledDate) {
    return new Response("Ce message sera disponible une fois la date de livraison ou de retrait fixée.", { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const mail = buildEmail(kind, order, await getSettings(), kind === "bon" ? await signUrl(order) : "");
  return new Response(mail.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
