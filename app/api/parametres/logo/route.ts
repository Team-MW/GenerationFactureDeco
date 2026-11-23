import { generateMissing } from "@/lib/generate";
import { CAN_WRITE, getLogo, readOnlyResponse, removeLogo, saveLogo } from "@/lib/settings";

export const dynamic = "force-dynamic";

const TYPES: Record<string, "png" | "jpg"> = { "image/png": "png", "image/jpeg": "jpg" };

export async function GET() {
  const logo = await getLogo();
  if (!logo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo.data), {
    headers: { "Content-Type": logo.format === "png" ? "image/png" : "image/jpeg", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!CAN_WRITE) return readOnlyResponse();
  const file = (await request.formData()).get("logo");
  if (!(file instanceof File) || !TYPES[file.type]) {
    return Response.json({ error: "Image PNG ou JPEG attendue." }, { status: 400 });
  }
  if (file.size > 1024 * 1024) {
    return Response.json({ error: "Logo trop volumineux (1 Mo maximum)." }, { status: 400 });
  }
  try {
    await saveLogo(Buffer.from(await file.arrayBuffer()), TYPES[file.type]);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Enregistrement impossible." }, { status: 500 });
  }
  void generateMissing().catch((error) => console.error("[factures]", error));
  return Response.json({ ok: true });
}

export async function DELETE() {
  if (!CAN_WRITE) return readOnlyResponse();
  await removeLogo();
  void generateMissing().catch((error) => console.error("[factures]", error));
  return Response.json({ ok: true });
}
