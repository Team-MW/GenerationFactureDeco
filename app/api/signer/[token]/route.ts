import { revalidatePath } from "next/cache";
import { SignError, signOrder } from "@/lib/orders/signature";
import { StoreError } from "@/lib/orders/store";

export const dynamic = "force-dynamic";

/** Enregistre la signature du client (page publique : le jeton du lien fait office d'autorisation). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const body = (await request.json().catch(() => null)) as { path?: unknown; accepted?: unknown } | null;
    if (body?.accepted !== true) throw new SignError("Cochez la case d'acceptation avant de signer.");
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const order = await signOrder(token, body.path, ip);
    revalidatePath("/", "layout");
    return Response.json({ ok: true, at: order.signature?.at });
  } catch (error) {
    if (error instanceof SignError || error instanceof StoreError) return Response.json({ ok: false, error: error.message }, { status: 400 });
    console.error("[signature]", error);
    return Response.json({ ok: false, error: "La signature n'a pas pu être enregistrée. Réessayez." }, { status: 500 });
  }
}
