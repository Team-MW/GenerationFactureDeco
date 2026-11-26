"use server";

import { cookies } from "next/headers";
import * as XLSX from "xlsx";
import { ACCESS_COOKIE, accessPassword, accessToken } from "@/lib/access";
import { guessCategory, type ChargeCategory, type ChargePeriod } from "@/lib/orders/pricing";

export interface ParsedCharge {
  label: string;
  amount: number;
  period: ChargePeriod;
  category: ChargeCategory;
  note: string;
}

/** Objectifs repérés dans le fichier, en plus des charges (tableau de bord de pilotage). */
export interface ParsedTargets {
  /** Objectif de chiffre d'affaires mensuel (hors taxes, comme en comptabilité). */
  monthlyRevenue?: number;
  /** Marge brute cible, en %. */
  grossMargin?: number;
}

/**
 * Lecture d'un tableau organisé en sections, chacune avec sa ligne de titres de colonnes
 * (« Poste de charge | Montant (€/mois) | … », « Poste | Nb personnes | … | Total mensuel (€) »).
 * Dans chaque section, la colonne des montants est celle dont le titre parle de total mensuel, sinon de mois,
 * sinon d'année. Les sections sans colonne de montant (informations générales, indicateurs) sont ignorées,
 * sauf pour y relever l'objectif de chiffre d'affaires et la marge cible.
 * Renvoie null si le fichier n'a pas cette forme.
 */
function parseSections(rows: unknown[][]): { charges: ParsedCharge[]; targets: ParsedTargets } | null {
  const charges: ParsedCharge[] = [];
  const targets: ParsedTargets = {};
  let amountColumn = -1;
  let period: ChargePeriod = "mois";
  let noteColumn = -1;
  let salaries = false;
  let headers = 0;
  for (const row of rows) {
    const filled = row.map((cell, column) => ({ column, text: String(cell ?? "").trim() })).filter((cell) => cell.text !== "");
    if (filled.length === 0) continue;
    const label = String(row[0] ?? "").trim();
    const key = plain(label);
    // Indicateurs utiles, où qu'ils soient dans le fichier.
    if (filled.length === 2 && /objectif ca mensuel/.test(key)) targets.monthlyRevenue = toNumber(filled[1].text) ?? undefined;
    if (filled.length === 2 && /marge brute cible/.test(key)) targets.grossMargin = toNumber(filled[1].text.replace("%", "")) ?? undefined;
    // Titre de section (une seule cellule) : la section suivante n'a pas encore ses colonnes.
    if (filled.length === 1) {
      amountColumn = -1;
      salaries = /salari|personnel|paie/.test(key);
      continue;
    }
    // Ligne de titres de colonnes : que du texte, aucun nombre.
    if (filled.every((cell) => toNumber(cell.text.replace("%", "")) === null) && filled.length >= 2) {
      const titles = filled.map((cell) => ({ column: cell.column, text: plain(cell.text) })).filter((cell) => cell.column > 0 && !/%/.test(cell.text));
      const pick = titles.find((t) => /total mensuel/.test(t.text)) ?? titles.find((t) => /mensuel|mois/.test(t.text) && !/brut\/pers|par pers/.test(t.text)) ?? titles.find((t) => /annuel|\ban\b/.test(t.text));
      amountColumn = pick ? pick.column : -1;
      period = pick && !/mensuel|mois/.test(pick.text) ? "an" : "mois";
      noteColumn = titles.find((t) => /note|commentaire|remarque/.test(t.text))?.column ?? -1;
      if (pick) headers += 1;
      continue;
    }
    if (amountColumn < 0 || !label) continue;
    if (/^(sous[- ]?)?total|^somme|^montant total/.test(key)) continue;
    const amount = toNumber(String(row[amountColumn] ?? ""));
    if (amount === null || amount <= 0) continue;
    charges.push({ label: label.slice(0, 80), amount: Math.round(amount * 100) / 100, period, category: salaries ? "salaire" : guessCategory(label), note: noteColumn >= 0 ? String(row[noteColumn] ?? "").trim().slice(0, 160) : "" });
  }
  return headers > 0 && charges.length > 0 ? { charges, targets } : null;
}

const plain = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").replace(/[\s  €%]/g, "").replace(",", ".");
  if (text === "" || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
};

const periodOf = (text: string): ChargePeriod | null => (/annu|par an|\/an|\ban\b|annee|year/.test(text) ? "an" : /trimestr|quarter/.test(text) ? "trimestre" : /mensu|par mois|\/mois|\bmois\b|month/.test(text) ? "mois" : null);

/**
 * Lit un fichier de charges (Excel ou CSV) et en propose les lignes. Rien n'est enregistré ici.
 * Le fichier peut être présenté librement : on repère la colonne des libellés (celle qui contient le plus de texte),
 * la colonne des montants (celle qui contient le plus de nombres) et, si elle existe, une colonne de périodicité.
 */
export async function parseChargesFile(form: FormData): Promise<{ ok: true; charges: ParsedCharge[]; targets: ParsedTargets; sheet: string } | { ok: false; error: string }> {
  const password = accessPassword();
  if (password && (await cookies()).get(ACCESS_COOKIE)?.value !== (await accessToken(password))) return { ok: false, error: "Session expirée : reconnectez-vous." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Aucun fichier reçu." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Fichier trop volumineux (5 Mo maximum)." };
  let rows: unknown[][];
  let sheetName: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = /\.csv$/i.test(file.name) ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, ""), { type: "string", raw: true }) : XLSX.read(buffer, { type: "buffer" });
    // La feuille la plus fournie est celle des charges.
    sheetName = workbook.SheetNames.map((name) => ({ name, size: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }).length })).sort((a, b) => b.size - a.size)[0]?.name ?? "";
    rows = sheetName ? (XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true }) as unknown[][]) : [];
  } catch {
    return { ok: false, error: "Fichier illisible : enregistrez-le au format Excel (.xlsx) ou CSV." };
  }
  rows = rows.filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (rows.length === 0) return { ok: false, error: "Le fichier est vide." };

  // Tableau de bord organisé en sections : lecture précise, section par section.
  const sections = parseSections(rows);
  if (sections) return { ok: true, charges: sections.charges.slice(0, 200), targets: sections.targets, sheet: sheetName };

  const width = Math.max(...rows.map((row) => row.length));
  const count = (test: (cell: unknown) => boolean) => Array.from({ length: width }, (_, column) => rows.filter((row) => test(row[column])).length);
  const texts = count((cell) => typeof cell === "string" && toNumber(cell) === null && cell.trim().length > 1);
  const numbers = count((cell) => toNumber(cell) !== null && String(cell).trim() !== "");
  const labelColumn = texts.indexOf(Math.max(...texts));
  // Plusieurs colonnes de montants (ex. mensuel et annuel) : on préfère celle dont l'en-tête dit « mensuel », sinon la première.
  const numeric = numbers.map((n, column) => ({ column, n })).filter((c) => c.n > 0 && c.column !== labelColumn);
  if (texts[labelColumn] === 0 || numeric.length === 0) return { ok: false, error: "Impossible de repérer une colonne de libellés et une colonne de montants dans ce fichier." };
  const headerOf = (column: number) => plain(rows.find((row) => typeof row[column] === "string" && toNumber(row[column]) === null)?.[column]);
  const best = Math.max(...numeric.map((c) => c.n));
  const candidates = numeric.filter((c) => c.n >= best * 0.6);
  const amountColumn = (candidates.find((c) => periodOf(headerOf(c.column)) === "mois") ?? candidates[0]).column;
  const columnPeriod = periodOf(headerOf(amountColumn));
  const periodColumn = Array.from({ length: width }, (_, column) => column).find((column) => column !== labelColumn && column !== amountColumn && rows.filter((row) => periodOf(plain(row[column])) !== null).length >= Math.max(2, rows.length / 3));

  const charges: ParsedCharge[] = [];
  for (const row of rows) {
    const label = String(row[labelColumn] ?? "").trim();
    const amount = toNumber(row[amountColumn]);
    if (!label || amount === null || amount <= 0) continue;
    // Les lignes de total fausseraient le calcul : elles sont ignorées.
    if (/^(sous[- ]?)?total|^somme|^montant total/.test(plain(label))) continue;
    const period = (periodColumn !== undefined ? periodOf(plain(row[periodColumn])) : null) ?? periodOf(plain(label)) ?? columnPeriod ?? "mois";
    charges.push({ label: label.slice(0, 80), amount: Math.round(amount * 100) / 100, period, category: guessCategory(label), note: "" });
  }
  if (charges.length === 0) return { ok: false, error: "Aucune ligne de charge avec un montant n'a été trouvée." };
  return { ok: true, charges: charges.slice(0, 200), targets: {}, sheet: sheetName };
}
