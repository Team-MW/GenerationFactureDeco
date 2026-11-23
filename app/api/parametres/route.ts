import { generateMissing } from "@/lib/generate";
import { CAN_WRITE, getSettings, readOnlyResponse, saveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getSettings());
}

export async function POST(request: Request) {
  if (!CAN_WRITE) return readOnlyResponse();
  try {
    const settings = await saveSettings(await request.json());
    void generateMissing().catch((error) => console.error("[factures]", error));
    return Response.json(settings);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Enregistrement impossible." }, { status: 500 });
  }
}
