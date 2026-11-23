import { generateMissing } from "@/lib/generate";
import { READ_ONLY, getSettings, readOnlyResponse, saveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getSettings());
}

export async function POST(request: Request) {
  if (READ_ONLY) return readOnlyResponse();
  const settings = saveSettings(await request.json());
  void generateMissing().catch((error) => console.error("[factures]", error));
  return Response.json(settings);
}
