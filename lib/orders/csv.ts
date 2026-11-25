import type { StockRow } from "./stock";

/** Lecture et écriture des fichiers de produits (CSV, séparateur « ; » ou « , »). Utilisable dans le navigateur. */

export interface ProductLine {
  reference: string;
  name: string;
  category: string;
  dimensions: string;
  color: string;
  /** null = colonne absente ou cellule vide. */
  price: number | null;
  stock: number | null;
}

/** Titres de colonnes reconnus, une fois mis en minuscules sans accents. */
const HEADERS: Record<keyof ProductLine, string[]> = {
  reference: ["reference", "ref", "sku", "code"],
  name: ["nom", "name", "produit", "designation", "article", "libelle"],
  category: ["categorie", "category", "famille", "type"],
  dimensions: ["dimensions_configuration", "dimensions", "dimension", "configuration", "taille"],
  color: ["coloris", "couleur", "color", "finition"],
  price: ["prix_vente_eur", "prix_vente", "prix", "prix_ttc", "price", "tarif"],
  stock: ["stock", "quantite", "qte", "quantity", "disponible", "nombre"],
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Découpe un texte CSV en lignes de cellules, guillemets et retours à la ligne dans une cellule compris. */
function cells(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === separator) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

const number = (value: string | undefined): number | null => {
  const text = (value ?? "").replace(/[\s  €]/g, "").replace(",", ".");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Lit un fichier de produits. Lève une erreur lisible si les colonnes indispensables manquent. */
export function parseProducts(raw: string): { lines: ProductLine[]; hasStock: boolean; hasPrice: boolean } {
  const text = raw.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const separator = firstLine.split(";").length >= firstLine.split(",").length ? ";" : ",";
  const [header, ...rows] = cells(text, separator);
  if (!header || rows.length === 0) throw new Error("Le fichier est vide.");
  const titles = header.map(normalize);
  const column = (field: keyof ProductLine) => titles.findIndex((title) => HEADERS[field].includes(title));
  const index = { reference: column("reference"), name: column("name"), category: column("category"), dimensions: column("dimensions"), color: column("color"), price: column("price"), stock: column("stock") };
  if (index.name < 0) throw new Error("Colonne « nom » introuvable. Colonnes attendues : reference ; nom ; categorie ; dimensions ; coloris ; prix ; stock.");
  const at = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
  const lines = rows
    .map((row) => ({
      reference: at(row, index.reference),
      name: at(row, index.name),
      category: at(row, index.category),
      dimensions: at(row, index.dimensions),
      color: at(row, index.color),
      price: index.price >= 0 ? number(row[index.price]) : null,
      stock: index.stock >= 0 ? number(row[index.stock]) : null,
    }))
    .filter((line) => line.name !== "");
  if (lines.length === 0) throw new Error("Aucun produit trouvé dans le fichier.");
  return { lines, hasStock: index.stock >= 0, hasPrice: index.price >= 0 };
}

/** Le stock au format du fichier d'import : on peut le rouvrir dans Excel, le corriger et le réimporter. */
export function productsToCsv(rows: StockRow[]): string {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    ["reference", "nom", "categorie", "dimensions_configuration", "coloris", "prix_vente_eur", "stock", "reserve", "en_attente"],
    ...rows.map((r) => [r.reference, r.name, r.category, r.dimensions, r.color, r.price > 0 ? String(r.price).replace(".", ",") : "", r.stock, r.reserved, r.waiting]),
  ];
  return "﻿" + lines.map((line) => line.map(cell).join(";")).join("\r\n");
}
