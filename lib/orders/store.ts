import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, READ_ONLY, ensureDataDir } from "../settings";
import { StoreError, USES_SUPABASE, rpc } from "../supabase";
import { createCache } from "../swr";
import type { Article, Db, Extra, Order, Payment, ShopId } from "./types";

/**
 * Stockage des articles et des commandes.
 *
 * - Si SUPABASE_URL et SUPABASE_SECRET_KEY sont définies : base Supabase (tables et
 *   fonctions décrites dans le dossier DB/). C'est le mode à utiliser en ligne.
 * - Sinon : fichier local data/gestion.json (pratique pour essayer sur son ordinateur).
 *
 * Toute l'application passe par loadDb() et mutate().
 */
const empty = (): Db => ({ articles: [], orders: [], counters: {}, depot: null });

const globals = globalThis as unknown as { __gestionQueue?: Promise<unknown> };

interface ArticleRow {
  id: string;
  name: string;
  reference: string;
  price: number;
  stock: number;
  created_at: string;
}

interface OrderRow {
  id: string;
  number: string;
  created_at: string;
  customer: Order["customer"];
  lines: Order["lines"];
  discount: Order["discount"];
  delivery: Order["delivery"];
  scheduled_date: string | null;
  slot: Order["slot"];
  prepared: boolean;
  prepared_at: string | null;
  reminded: boolean;
  status: Order["status"];
  done_at: string | null;
  geo: Order["geo"];
  history: Order["history"];
  /** Champs ajoutés après coup, regroupés pour éviter une migration à chaque évolution. */
  extra: { shop?: ShopId; observations?: string; paid?: number; time?: string; payments?: Payment[]; extras?: Extra[]; geoFailed?: boolean } | null;
}

const articleFromRow = (r: ArticleRow): Article => ({
  id: r.id,
  name: r.name,
  reference: r.reference,
  price: Number(r.price),
  stock: Number(r.stock),
  createdAt: r.created_at,
});

const articleToRow = (a: Article): ArticleRow => ({
  id: a.id,
  name: a.name,
  reference: a.reference,
  price: a.price,
  stock: a.stock,
  created_at: a.createdAt,
});

/** Une commande réglée avant l'existence du détail des encaissements reçoit une ligne unique équivalente. */
function withPayments(order: Order): Order {
  if (order.paid > 0 && order.payments.length === 0) {
    order.payments = [{ at: order.createdAt, amount: order.paid, method: "", by: "magasin" }];
  }
  return order;
}

const orderFromRow = (r: OrderRow): Order => withPayments({
  id: r.id,
  number: r.number,
  createdAt: r.created_at,
  shop: r.extra?.shop ?? "toulouse",
  observations: r.extra?.observations ?? "",
  paid: Number(r.extra?.paid ?? 0),
  payments: r.extra?.payments ?? [],
  extras: r.extra?.extras ?? [],
  customer: { ...r.customer, email: r.customer.email ?? "" },
  lines: r.lines,
  discount: r.discount,
  delivery: r.delivery,
  scheduledDate: r.scheduled_date,
  slot: r.slot,
  time: r.extra?.time ?? "",
  prepared: r.prepared,
  preparedAt: r.prepared_at,
  reminded: r.reminded,
  status: r.status,
  doneAt: r.done_at,
  geo: r.geo,
  geoFailed: r.extra?.geoFailed ?? false,
  history: r.history ?? [],
});

const orderToRow = (o: Order): OrderRow => ({
  id: o.id,
  number: o.number,
  created_at: o.createdAt,
  customer: o.customer,
  lines: o.lines,
  discount: o.discount,
  delivery: o.delivery,
  scheduled_date: o.scheduledDate,
  slot: o.slot,
  prepared: o.prepared,
  prepared_at: o.preparedAt,
  reminded: o.reminded,
  status: o.status,
  done_at: o.doneAt,
  geo: o.geo,
  history: o.history,
  extra: { shop: o.shop, observations: o.observations, paid: o.paid, time: o.time, payments: o.payments, extras: o.extras, geoFailed: o.geoFailed ?? false },
});

async function loadRemote(): Promise<{ db: Db; version: number }> {
  const raw = (await rpc<{ version?: number; counters?: Db["counters"]; depot?: Db["depot"]; articles?: ArticleRow[]; orders?: OrderRow[] } | null>("gestion_load")) ?? {};
  return {
    version: Number(raw.version ?? 0),
    db: {
      articles: (raw.articles ?? []).map(articleFromRow),
      orders: (raw.orders ?? []).map(orderFromRow),
      counters: raw.counters ?? {},
      depot: raw.depot ?? null,
    },
  };
}

/** Lit, modifie, puis enregistre uniquement ce qui a changé. Recommence si un autre enregistrement est passé entre-temps. */
// Lectures : valeur de moins de 4 s servie telle quelle ; jusqu'à 20 s, servie puis rafraîchie derrière.
const remoteCache = createCache("gestion", loadRemote, 4000, 20000);

async function mutateRemote<T>(change: (db: Db) => T | Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { db, version } = await loadRemote();
    const before = new Map<string, string>();
    for (const a of db.articles) before.set(`a:${a.id}`, JSON.stringify(a));
    for (const o of db.orders) before.set(`o:${o.id}`, JSON.stringify(o));

    const result = await change(db);

    const articles = db.articles.filter((a) => before.get(`a:${a.id}`) !== JSON.stringify(a)).map(articleToRow);
    const orders = db.orders.filter((o) => before.get(`o:${o.id}`) !== JSON.stringify(o)).map(orderToRow);
    const saved = await rpc<boolean>("gestion_save", {
      p_version: version,
      p_articles: articles,
      p_orders: orders,
      p_counters: db.counters,
      p_depot: db.depot,
    });
    if (saved === true) {
      // La page qui se recharge après l'action retrouve ces données sans nouvel appel à la base.
      remoteCache.set({ db: structuredClone(db), version: version + 1 });
      return result;
    }
    // Conflit : quelqu'un d'autre vient d'enregistrer. On repart des données fraîches.
    await new Promise((resolve) => setTimeout(resolve, 40 + Math.random() * 120));
  }
  throw new StoreError("Trop de modifications en même temps. Réessayez.");
}

/* ───────────────────────── Fichier local ───────────────────────── */

const FILE = path.join(DATA_DIR, "gestion.json");

function loadFile(): Db {
  let text: string;
  try {
    text = fs.readFileSync(FILE, "utf8");
  } catch {
    return empty(); // premier lancement : pas encore de fichier
  }
  try {
    const db: Db = { ...empty(), ...JSON.parse(text) };
    // Commandes enregistrées avant l'ajout de ces champs.
    for (const order of db.orders) {
      order.shop ??= "toulouse";
      order.observations ??= "";
      order.paid ??= 0;
      order.time ??= "";
      order.payments ??= [];
      order.extras ??= [];
      withPayments(order);
      order.customer.email ??= "";
    }
    return db;
  } catch {
    // Fichier abîmé : on s'arrête plutôt que de repartir de zéro et de réutiliser des numéros de bon.
    throw new StoreError("Le fichier data/gestion.json est illisible. Restaurez-le depuis une sauvegarde avant de continuer.");
  }
}

async function mutateFile<T>(change: (db: Db) => T | Promise<T>): Promise<T> {
  if (READ_ONLY) {
    throw new StoreError("Enregistrement impossible : la base de données n'est pas configurée sur la version en ligne.");
  }
  const db = loadFile();
  const result = await change(db);
  ensureDataDir();
  const temp = `${FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, FILE);
  return result;
}

/* ───────────────────────── Interface commune ───────────────────────── */

export async function loadDb(): Promise<Db> {
  // Copie : une page ne doit jamais pouvoir modifier la valeur gardée en cache.
  return USES_SUPABASE ? structuredClone((await remoteCache.read()).db) : loadFile();
}

/** Lecture directe en base, sans cache : pour vérifier qu'un élément introuvable n'existe vraiment pas. */
export async function loadDbFresh(): Promise<Db> {
  if (!USES_SUPABASE) return loadFile();
  const fresh = await loadRemote();
  remoteCache.set(fresh);
  return structuredClone(fresh.db);
}

/** Applique une modification de façon atomique : les écritures de ce serveur sont exécutées une par une. */
export function mutate<T>(change: (db: Db) => T | Promise<T>): Promise<T> {
  const run = () => (USES_SUPABASE ? mutateRemote(change) : mutateFile(change));
  const next = (globals.__gestionQueue ?? Promise.resolve()).then(run, run);
  globals.__gestionQueue = next.catch(() => undefined);
  return next;
}

export { StoreError, USES_SUPABASE };
