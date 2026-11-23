import { setDesignation } from "@/lib/data";
import { CAN_WRITE, readOnlyResponse } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Modifie la désignation (le meuble vendu) d'une facture. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!CAN_WRITE) return readOnlyResponse();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  try {
    const found = await setDesignation(id, String(body?.designation ?? ""));
    if (!found) return Response.json({ error: "Facture introuvable." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Enregistrement impossible." }, { status: 500 });
  }
}
