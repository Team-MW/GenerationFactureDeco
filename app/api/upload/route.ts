import fs from "node:fs";
import path from "node:path";
import { ACCEPTED_EXTENSIONS, getDataset } from "@/lib/data";
import { generateMissing } from "@/lib/generate";
import { DATA_DIR, READ_ONLY, ensureDataDir, readOnlyResponse } from "@/lib/settings";

export const dynamic = "force-dynamic";

const MAX_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  if (READ_ONLY) return readOnlyResponse();
  const form = await request.formData();
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  if (uploads.length === 0) {
    return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  ensureDataDir();
  const before = getDataset().invoices.length;
  const saved: string[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const file of uploads) {
    const name = path.basename(file.name).replace(/[\\/:*?"<>|]/g, "_");
    const ext = path.extname(name).toLowerCase();
    if (name.startsWith(".") || !ACCEPTED_EXTENSIONS.includes(ext)) {
      skipped.push({ name, reason: "format non pris en charge (CSV ou Excel attendu)" });
      continue;
    }
    if (file.size > MAX_SIZE) {
      skipped.push({ name, reason: "fichier trop volumineux" });
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    let target = path.join(DATA_DIR, name);
    let identical = false;
    // Ne jamais écraser un fichier existant : on ignore les copies identiques, on renomme les autres.
    for (let i = 2; fs.existsSync(/* turbopackIgnore: true */ target); i++) {
      if (fs.readFileSync(/* turbopackIgnore: true */ target).equals(buffer)) {
        identical = true;
        break;
      }
      target = path.join(DATA_DIR, `${path.basename(name, ext)} - copie ${i}${ext}`);
    }
    if (identical) {
      skipped.push({ name, reason: "déjà importé" });
      continue;
    }
    fs.writeFileSync(target, buffer);
    saved.push(path.basename(target));
  }

  const after = getDataset().invoices.length;
  // Génération des PDF en arrière-plan : la réponse n'attend pas.
  void generateMissing().catch((error) => console.error("[factures]", error));
  return Response.json({ saved, skipped, newInvoices: after - before });
}
