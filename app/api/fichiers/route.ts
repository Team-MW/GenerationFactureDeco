import fs from "node:fs";
import path from "node:path";
import { removeFile } from "@/lib/data";
import { CAN_WRITE, DATA_DIR, READ_ONLY, readOnlyResponse } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Retire un fichier importé et ses factures. La copie locale part dans data/.corbeille (jamais supprimée). */
export async function DELETE(request: Request) {
  if (!CAN_WRITE) return readOnlyResponse();
  const name = path.basename(new URL(request.url).searchParams.get("nom") ?? "");
  if (!name || name.startsWith(".")) return Response.json({ error: "Fichier introuvable." }, { status: 404 });
  try {
    if (!(await removeFile(name))) return Response.json({ error: "Fichier introuvable." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Suppression impossible." }, { status: 500 });
  }
  if (!READ_ONLY) {
    try {
      const source = path.join(DATA_DIR, name);
      if (fs.existsSync(/* turbopackIgnore: true */ source)) {
        const trash = path.join(DATA_DIR, ".corbeille");
        fs.mkdirSync(trash, { recursive: true });
        fs.renameSync(source, path.join(trash, `${Date.now()}-${name}`));
      }
    } catch {
      // le fichier reste dans data/ mais ne sera pas réimporté
    }
  }
  return Response.json({ ok: true });
}
