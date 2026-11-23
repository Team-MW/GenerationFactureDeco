import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, READ_ONLY, readOnlyResponse } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Retire un fichier source : il est déplacé dans data/.corbeille (jamais supprimé définitivement). */
export async function DELETE(request: Request) {
  if (READ_ONLY) return readOnlyResponse();
  const name = path.basename(new URL(request.url).searchParams.get("nom") ?? "");
  const source = path.join(DATA_DIR, name);
  if (!name || name.startsWith(".") || !fs.existsSync(source)) {
    return Response.json({ error: "Fichier introuvable." }, { status: 404 });
  }
  const trash = path.join(DATA_DIR, ".corbeille");
  fs.mkdirSync(trash, { recursive: true });
  fs.renameSync(source, path.join(trash, `${Date.now()}-${name}`));
  return Response.json({ ok: true });
}
