import { getVersion } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Interrogé régulièrement par l'interface pour détecter les nouveaux fichiers. */
export async function GET() {
  try {
    return Response.json({ version: await getVersion() });
  } catch {
    return Response.json({ version: null }, { status: 503 });
  }
}
