import { getDataset } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Interrogé régulièrement par l'interface pour détecter les nouveaux fichiers. */
export function GET() {
  const { version, invoices, files } = getDataset();
  return Response.json({ version, invoices: invoices.length, files: files.length });
}
