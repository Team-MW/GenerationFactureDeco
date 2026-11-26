import { after } from "next/server";
import path from "node:path";
import { ACCEPTED_EXTENSIONS, importUpload } from "@/lib/data";
import { generateMissing } from "@/lib/generate";
import { CAN_WRITE, readOnlyResponse } from "@/lib/settings";

export const dynamic = "force-dynamic";

const MAX_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  if (!CAN_WRITE) return readOnlyResponse();
  const form = await request.formData();
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  if (uploads.length === 0) return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });

  const saved: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  let newInvoices = 0;

  for (const file of uploads) {
    const name = path.basename(file.name);
    if (name.startsWith(".") || !ACCEPTED_EXTENSIONS.includes(path.extname(name).toLowerCase())) {
      skipped.push({ name, reason: "format non pris en charge (CSV ou Excel attendu)" });
      continue;
    }
    if (file.size > MAX_SIZE) {
      skipped.push({ name, reason: "fichier trop volumineux" });
      continue;
    }
    try {
      const result = await importUpload(name, Buffer.from(await file.arrayBuffer()));
      if (result.status === "imported") {
        saved.push(result.name);
        newInvoices += result.invoices;
      } else {
        skipped.push({ name, reason: result.status === "duplicate" ? "déjà importé" : (result.message ?? "fichier illisible") });
      }
    } catch (error) {
      skipped.push({ name, reason: error instanceof Error ? error.message : "import impossible" });
    }
  }

  // Copies PDF sur le disque (usage local) : en arrière-plan, la réponse n'attend pas.
  after(() => generateMissing().catch((error) => console.error("[factures]", error)));
  return Response.json({ saved, skipped, newInvoices });
}
