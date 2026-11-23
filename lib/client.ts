"use client";

export type ToastKind = "success" | "error" | "info";

export function toast(message: string, kind: ToastKind = "success") {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { message, kind } }));
}

interface UploadResult {
  saved: string[];
  skipped: { name: string; reason: string }[];
  newInvoices: number;
  error?: string;
}

/** Envoie des fichiers au serveur et affiche le résultat. Retourne true si au moins un fichier a été importé. */
export async function uploadFiles(files: File[]): Promise<boolean> {
  if (files.length === 0) return false;
  const body = new FormData();
  for (const file of files) body.append("files", file);
  try {
    const response = await fetch("/api/upload", { method: "POST", body });
    const result: UploadResult = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Import impossible");
    for (const s of result.skipped) toast(`${s.name} : ${s.reason}`, "info");
    if (result.saved.length > 0) {
      const n = result.newInvoices;
      toast(
        `${result.saved.length} fichier${result.saved.length > 1 ? "s" : ""} importé${result.saved.length > 1 ? "s" : ""} · ` +
          (n > 0 ? `${n} facture${n > 1 ? "s" : ""} générée${n > 1 ? "s" : ""}` : "aucune nouvelle facture"),
      );
      return true;
    }
    return false;
  } catch (error) {
    toast(error instanceof Error ? error.message : "Import impossible", "error");
    return false;
  }
}
