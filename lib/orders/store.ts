import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, READ_ONLY, ensureDataDir } from "../settings";
import { cookies } from "next/headers";
import { StoreError, USES_SUPABASE, readValue, replaceValueIfVersion, rpc, writeValue } from "../supabase";
import { demoDb } from "./demo";
import { createCache } from "../swr";
import type { Article, Db, Extra, Order, Payment, ShopId, Signature } from "./types";

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
  category?: string | null;
  dimensions?: string | null;
  color?: string | null;
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
  extra: { shop?: ShopId; observations?: string; paid?: number; time?: string; payments?: Payment[]; extras?: Extra[]; geoFailed?: boolean; emails?: Order["emails"]; signToken?: string; signature?: Signature | null } | null;
}

const articleFromRow = (r: ArticleRow): Article => ({
  id: r.id,
  name: r.name,
  reference: r.reference,
  // Colonnes ajoutées par DB/06_inventaire.sql : absentes tant que ce script n'a pas été lancé.
  category: r.category ?? "",
  dimensions: r.dimensions ?? "",
  color: r.color ?? "",
  price: Number(r.price),
  stock: Number(r.stock),
  createdAt: r.created_at,
});

const articleToRow = (a: Article): ArticleRow => ({
  id: a.id,
  name: a.name,
  reference: a.reference,
  category: a.category,
  dimensions: a.dimensions,
  color: a.color,
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
  emails: r.extra?.emails ?? [],
  history: r.history ?? [],
  signToken: r.extra?.signToken ?? "",
  signature: r.extra?.signature ?? null,
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
  extra: { shop: o.shop, observations: o.observations, paid: o.paid, time: o.time, payments: o.payments, extras: o.extras, geoFailed: o.geoFailed ?? false, emails: o.emails, signToken: o.signToken, signature: o.signature },
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
    for (const article of db.articles) withArticleDefaults(article);
    // Commandes enregistrées avant l'ajout de ces champs.
    for (const order of db.orders) {
      order.shop ??= "toulouse";
      order.observations ??= "";
      order.paid ??= 0;
      order.time ??= "";
      order.payments ??= [];
      order.extras ??= [];
      order.emails ??= [];
      order.signToken ??= "";
      order.signature ??= null;
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

/* ───────────────────────── Mode test ───────────────────────── */

/**
 * Le mode test travaille sur un jeu de données à part (commandes fictives), jamais mélangé aux vraies.
 * Il s'active par un cookie posé depuis la page d'accueil : il est donc propre à chaque appareil.
 * Stockage : une seule valeur JSON { version, db } (table deco_settings, ou fichier local).
 */
export type Scope = "real" | "test";
export const TEST_COOKIE = "mode";

export async function currentScope(): Promise<Scope> {
  try {
    return (await cookies()).get(TEST_COOKIE)?.value === "test" ? "test" : "real";
  } catch {
    return "real"; // hors d'une requête (tâche de fond) : toujours les vraies données
  }
}

interface TestState {
  version: number;
  db: Db;
}

const TEST_KEY = "gestion_test";
const TEST_FILE = path.join(DATA_DIR, "gestion-test.json");
const testMemory = globalThis as unknown as { __gestionTest?: TestState };

async function readTest(): Promise<TestState | null> {
  if (USES_SUPABASE) return readValue<TestState>(TEST_KEY);
  if (READ_ONLY) return testMemory.__gestionTest ?? null;
  try {
    return JSON.parse(fs.readFileSync(TEST_FILE, "utf8"));
  } catch {
    return null;
  }
}

/** Enregistre le jeu de test. Renvoie false si une autre modification est passée entre-temps. */
async function writeTest(next: TestState, expectedVersion: number | null): Promise<boolean> {
  if (USES_SUPABASE) {
    if (expectedVersion === null) {
      await writeValue(TEST_KEY, next);
      return true;
    }
    return replaceValueIfVersion(TEST_KEY, expectedVersion, next);
  }
  if (READ_ONLY) {
    testMemory.__gestionTest = next;
    return true;
  }
  ensureDataDir();
  fs.writeFileSync(`${TEST_FILE}.tmp`, JSON.stringify(next, null, 2));
  fs.renameSync(`${TEST_FILE}.tmp`, TEST_FILE);
  return true;
}

/** Articles enregistrés avant l'ajout de la catégorie, des dimensions et du coloris. */
function withArticleDefaults(article: Article): Article {
  article.category ??= "";
  article.dimensions ??= "";
  article.color ??= "";
  return article;
}

/** Commandes de test enregistrées avant l'ajout de ces champs. */
function withDefaults(order: Order): Order {
  order.emails ??= [];
  order.signToken ??= "";
  order.signature ??= null;
  return order;
}

/** Charge le jeu de test ; le crée avec la simulation s'il n'existe pas encore. */
async function loadTest(): Promise<TestState> {
  const existing = await readTest();
  if (existing?.db) {
    for (const order of existing.db.orders) withDefaults(order);
    existing.db.articles.forEach(withArticleDefaults);
    return existing;
  }
  const fresh: TestState = { version: 1, db: demoDb() };
  await writeTest(fresh, null);
  return fresh;
}

const testCache = createCache("gestion-test", loadTest, 4000, 20000);

async function mutateTest<T>(change: (db: Db) => T | Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const state = await loadTest();
    const result = await change(state.db);
    const next = { version: state.version + 1, db: state.db };
    if (await writeTest(next, state.version)) {
      testCache.set(structuredClone(next));
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 40 + Math.random() * 120));
  }
  throw new StoreError("Trop de modifications en même temps. Réessayez.");
}

/** Remet le jeu de test à zéro : recharge la simulation, datée d'aujourd'hui. */
export async function resetTestData(): Promise<void> {
  const current = await readTest();
  const next: TestState = { version: (current?.version ?? 0) + 1, db: demoDb() };
  await writeTest(next, null);
  testCache.set(structuredClone(next));
}

/* ───────────────────────── Interface commune ───────────────────────── */

export async function loadDb(): Promise<Db> {
  if ((await currentScope()) === "test") return structuredClone((await testCache.read()).db);
  // Copie : une page ne doit jamais pouvoir modifier la valeur gardée en cache.
  return USES_SUPABASE ? structuredClone((await remoteCache.read()).db) : loadFile();
}

/** Lecture directe en base, sans cache : pour vérifier qu'un élément introuvable n'existe vraiment pas. */
export async function loadDbFresh(): Promise<Db> {
  if ((await currentScope()) === "test") {
    const fresh = await loadTest();
    testCache.set(structuredClone(fresh));
    return structuredClone(fresh.db);
  }
  if (!USES_SUPABASE) return loadFile();
  const fresh = await loadRemote();
  remoteCache.set(fresh);
  return structuredClone(fresh.db);
}

function enqueue<T>(scope: Promise<Scope>, change: (db: Db) => T | Promise<T>): Promise<T> {
  const start = scope.then((s) => () => (s === "test" ? mutateTest(change) : USES_SUPABASE ? mutateRemote(change) : mutateFile(change)));
  const run = () => start.then((go) => go());
  const next = (globals.__gestionQueue ?? Promise.resolve()).then(run, run);
  globals.__gestionQueue = next.catch(() => undefined);
  return next;
}

/** Applique une modification de façon atomique : les écritures de ce serveur sont exécutées une par une. */
export function mutate<T>(change: (db: Db) => T | Promise<T>): Promise<T> {
  // Le mode (réel ou test) est lu tout de suite, dans le contexte de la requête, avant la mise en file.
  return enqueue(currentScope(), change);
}

/* ───────────── Accès sans cookie (page publique de signature) ───────────── */

/** Lit un jeu de données précis. `fresh` contourne le cache. Ne crée jamais le jeu de test. */
export async function loadScope(scope: Scope, fresh = false): Promise<Db> {
  if (scope === "test") {
    const state = await readTest();
    if (!state?.db) return empty();
    state.db.orders.forEach(withDefaults);
    state.db.articles.forEach(withArticleDefaults);
    return state.db;
  }
  if (!USES_SUPABASE) return loadFile();
  if (!fresh) return structuredClone((await remoteCache.read()).db);
  const loaded = await loadRemote();
  remoteCache.set(loaded);
  return structuredClone(loaded.db);
}

/** Comme mutate(), mais sur un jeu de données désigné explicitement. */
export function mutateIn<T>(scope: Scope, change: (db: Db) => T | Promise<T>): Promise<T> {
  return enqueue(Promise.resolve(scope), change);
}

export { StoreError, USES_SUPABASE };
