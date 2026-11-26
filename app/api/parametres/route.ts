import { after } from "next/server";
import { generateMissing } from "@/lib/generate";
import { geocode } from "@/lib/orders/geocode";
import { CAN_WRITE, DEFAULT_SETTINGS, getSettings, readOnlyResponse, saveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getSettings());
}

export async function POST(request: Request) {
  if (!CAN_WRITE) return readOnlyResponse();
  try {
    const input = await request.json();
    const current = await getSettings();
    // Adresse de départ des tournées : vide = adresse par défaut ; modifiée = elle doit exister sur la carte.
    if (typeof input.depotAddress === "string") {
      input.depotAddress = input.depotAddress.trim() || DEFAULT_SETTINGS.depotAddress;
      if (input.depotAddress !== current.depotAddress && !(await geocode(input.depotAddress))) {
        return Response.json({ error: "Adresse de départ des livraisons introuvable sur la carte. Vérifiez le numéro, la rue et la ville." }, { status: 400 });
      }
    }
    const settings = await saveSettings(input);
    after(() => generateMissing().catch((error) => console.error("[factures]", error)));
    return Response.json(settings);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Enregistrement impossible." }, { status: 500 });
  }
}
