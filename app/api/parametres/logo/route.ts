import fs from "node:fs";
import path from "node:path";
import { generateMissing } from "@/lib/generate";
import { READ_ONLY, getLogoPath, readOnlyResponse, removeLogo, saveLogo } from "@/lib/settings";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

export function GET() {
  const logo = getLogoPath();
  if (!logo) return new Response(null, { status: 404 });
  const type = path.extname(logo) === ".png" ? "image/png" : "image/jpeg";
  return new Response(new Uint8Array(fs.readFileSync(logo)), {
    headers: { "Content-Type": type, "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (READ_ONLY) return readOnlyResponse();
  const file = (await request.formData()).get("logo");
  if (!(file instanceof File) || !TYPES[file.type]) {
    return Response.json({ error: "Image PNG ou JPEG attendue." }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return Response.json({ error: "Logo trop volumineux (2 Mo maximum)." }, { status: 400 });
  }
  saveLogo(Buffer.from(await file.arrayBuffer()), TYPES[file.type]);
  void generateMissing().catch((error) => console.error("[factures]", error));
  return Response.json({ ok: true });
}

export function DELETE() {
  if (READ_ONLY) return readOnlyResponse();
  removeLogo();
  void generateMissing().catch((error) => console.error("[factures]", error));
  return Response.json({ ok: true });
}
