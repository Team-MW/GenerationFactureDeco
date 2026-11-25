"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { geocode } from "@/lib/orders/geocode";
import { DELIVERY_MODES, PAYMENT_METHODS, cleanTime, fullAddress, hourLabel, isPickup, isStockComplete, orderTotals, parisToday, slotOfTime } from "@/lib/orders/logic";
import { UserError, articleFields, clean, euros, id, insertOrder, isDate, frDate, log, makeArticle, now, parsePrice, round2, signToken } from "@/lib/orders/build";
import { signUrl } from "@/lib/orders/signature";
import { StoreError, currentScope, loadDb, mutate } from "@/lib/orders/store";
import type { ArticleInput, Db, Order, OrderInput, PaymentMethod, Result, Slot } from "@/lib/orders/types";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { MAIL_CONFIGURED, MailError, isEmail, sendMail } from "@/lib/mail";
import { EMAIL_KINDS, buildEmail, isEmailKind, type EmailKind } from "@/lib/orders/emails";
import { renderDeliveryNote } from "@/lib/orders/pdf";
import { ACCESS_COOKIE, accessPassword, accessToken } from "@/lib/access";


/** Exécute une action et renvoie toujours un résultat lisible par l'interface. */
async function run<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    // Deuxième verrou, en plus du contrôle à l'entrée du site : aucune action sans le code d'accès.
    const password = accessPassword();
    if (password && (await cookies()).get(ACCESS_COOKIE)?.value !== (await accessToken(password))) {
      return { ok: false, error: "Session expirée : reconnectez-vous." };
    }
    const data = await work();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof UserError || error instanceof StoreError || error instanceof MailError) return { ok: false, error: error.message };
    console.error("[commandes]", error);
    return { ok: false, error: "Une erreur est survenue. Réessayez." };
  }
}


function findOrder(db: Db, orderId: string): Order {
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw new UserError("Commande introuvable.");
  return order;
}

/**
 * Attribue le stock disponible aux lignes en attente, de la commande la plus ancienne à la plus récente.
 * Appelé après chaque entrée de stock ou annulation.
 */
function allocate(db: Db) {
  const waiting = db.orders
    .filter((o) => o.status === "active")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const order of waiting) {
    const wasComplete = isStockComplete(order);
    for (const line of order.lines) {
      if (line.reserved) continue;
      const article = db.articles.find((a) => a.id === line.articleId);
      if (article && article.stock >= line.quantity) {
        article.stock -= line.quantity;
        line.reserved = true;
        log(order, `Stock disponible : ${line.quantity} × ${line.name} réservé`);
      }
    }
    if (!wasComplete && isStockComplete(order)) log(order, "Tous les articles sont en stock");
  }
}

/* ───────────────────────── Articles & stock ───────────────────────── */

export async function createArticle(input: ArticleInput & { stock: number }) {
  return run(() =>
    mutate((db) => {
      const article = makeArticle(db, input);
      allocate(db);
      return article.id;
    }),
  );
}

export async function updateArticle(articleId: string, input: ArticleInput) {
  return run(() =>
    mutate((db) => {
      const article = db.articles.find((a) => a.id === articleId);
      if (!article) throw new UserError("Article introuvable.");
      // Les bons déjà émis gardent la désignation et le prix du jour de la commande.
      Object.assign(article, articleFields(db, input, articleId));
      return undefined;
    }),
  );
}

/** Entrée (quantité positive) ou correction (quantité négative) de stock. */
export async function adjustStock(articleId: string, delta: number) {
  return run(() =>
    mutate((db) => {
      const article = db.articles.find((a) => a.id === articleId);
      if (!article) throw new UserError("Article introuvable.");
      const change = Math.trunc(Number(delta));
      if (!Number.isFinite(change) || change === 0) throw new UserError("Quantité invalide.");
      if (article.stock + change < 0) throw new UserError(`Stock insuffisant : il reste ${article.stock} en disponible.`);
      article.stock += change;
      if (change > 0) allocate(db);
      return undefined;
    }),
  );
}

/** Inventaire : fixe la quantité réellement disponible d'un article (comptage en magasin). */
export async function setStock(articleId: string, quantity: number) {
  return run(() =>
    mutate((db) => {
      const article = db.articles.find((a) => a.id === articleId);
      if (!article) throw new UserError("Article introuvable.");
      const value = Math.trunc(Number(quantity));
      if (!Number.isFinite(value) || value < 0 || value > 99999) throw new UserError("Quantité invalide.");
      const added = value > article.stock;
      article.stock = value;
      // Ce qui vient d'être compté en plus sert d'abord les commandes en attente.
      if (added) allocate(db);
      return article.stock;
    }),
  );
}

/** Fixe le prix de vente d'un article (saisie rapide dans le tableau du stock). */
export async function setArticlePrice(articleId: string, price: number) {
  return run(() =>
    mutate((db) => {
      const article = db.articles.find((a) => a.id === articleId);
      if (!article) throw new UserError("Article introuvable.");
      article.price = parsePrice(price, "Prix");
      return undefined;
    }),
  );
}

export interface ImportedArticle {
  reference: string;
  name: string;
  category: string;
  dimensions: string;
  color: string;
  /** null = le fichier ne donne pas l'information : on ne touche pas à la valeur existante. */
  price: number | null;
  stock: number | null;
}

/**
 * Import d'un fichier de produits. Un produit déjà connu (même référence) est mis à jour, les autres sont créés.
 * `defaultStock` : quantité donnée aux nouveaux produits quand le fichier n'a pas de colonne de stock.
 */
export async function importArticles(rows: ImportedArticle[], defaultStock: number) {
  return run(() =>
    mutate((db) => {
      if (!Array.isArray(rows) || rows.length === 0) throw new UserError("Le fichier ne contient aucun produit.");
      if (rows.length > 3000) throw new UserError("Fichier trop volumineux (3 000 produits maximum par import).");
      const initial = Math.min(99999, Math.max(0, Math.trunc(Number(defaultStock)) || 0));
      const quantity = (value: unknown) => Math.min(99999, Math.max(0, Math.trunc(Number(value)) || 0));
      const byReference = new Map(db.articles.filter((a) => a.reference).map((a) => [a.reference.toLowerCase(), a]));
      let created = 0, updated = 0, restocked = false;
      rows.forEach((row, index) => {
        const name = clean(row?.name, 120);
        if (!name) throw new UserError(`Ligne ${index + 2} : le nom du produit est vide.`);
        const reference = clean(row.reference, 120);
        const price = row.price === null || row.price === undefined ? null : parsePrice(row.price, `Ligne ${index + 2} : prix`);
        const existing = reference ? byReference.get(reference.toLowerCase()) : undefined;
        if (existing) {
          existing.name = name;
          existing.category = clean(row.category, 60);
          existing.dimensions = clean(row.dimensions, 80);
          existing.color = clean(row.color, 80);
          if (price !== null && price > 0) existing.price = price;
          if (row.stock !== null && row.stock !== undefined) {
            const next = quantity(row.stock);
            restocked ||= next > existing.stock;
            existing.stock = next;
          }
          updated += 1;
        } else {
          const article = makeArticle(db, { name, reference, category: row.category, dimensions: row.dimensions, color: row.color, price: price ?? 0, stock: row.stock === null || row.stock === undefined ? initial : quantity(row.stock) });
          if (reference) byReference.set(reference.toLowerCase(), article);
          restocked ||= article.stock > 0;
          created += 1;
        }
      });
      if (restocked) allocate(db);
      return { created, updated };
    }),
  );
}

/* ───────────────────────── Commandes ───────────────────────── */

/** Recherche les coordonnées d'une adresse. Facultatif : un échec ne doit jamais faire échouer la commande. */
async function locate(orderId: string) {
  try {
    await locateOrder(orderId);
  } catch (error) {
    console.error("[commandes] géolocalisation :", error instanceof Error ? error.message : error);
  }
}

async function locateOrder(orderId: string) {
  const db = await loadDb();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order || order.geo || order.geoFailed || isPickup(order)) return;
  const geo = await geocode(fullAddress(order));
  await mutate((fresh) => {
    const target = fresh.orders.find((o) => o.id === orderId);
    if (!target) return;
    if (geo) target.geo = geo;
    else target.geoFailed = true; // adresse introuvable : on ne réessaiera pas à chaque ouverture
  });
}

export async function createOrder(input: OrderInput) {
  return run(async () => {
    const scope = await currentScope();
    const orderId = await mutate((db) => {
      return insertOrder(db, input, scope === "test" ? "TEST" : "BL").id;
    });
    await locate(orderId);
    // E-mails dès la création, si demandé : le bon de commande, et la date de livraison quand elle est déjà fixée.
    // Un échec d'envoi ne bloque jamais la commande.
    if (input.sendEmail && scope === "real" && MAIL_CONFIGURED) {
      const kinds: EmailKind[] = input.scheduledDate ? ["bon", "programmation"] : ["bon"];
      for (const kind of kinds) {
        try {
          await deliverEmail(orderId, kind);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "erreur inconnue";
          await mutate((db) => log(findOrder(db, orderId), `E-mail « ${EMAIL_KINDS[kind].label.toLowerCase()} » non envoyé : ${reason}`)).catch(() => undefined);
        }
      }
    }
    return orderId;
  });
}

/* ───────────────────────── E-mails au client ───────────────────────── */

/** Envoie réellement un message et le consigne sur la commande. */
async function deliverEmail(orderId: string, kind: EmailKind) {
  const order = findOrder(await loadDb(), orderId);
  if (order.status === "cancelled") throw new UserError("Cette commande est annulée : aucun e-mail n'est envoyé.");
  const to = order.customer.email.trim();
  if (!to) throw new UserError("Cette commande n'a pas d'adresse e-mail client.");
  if (!isEmail(to)) throw new UserError("L'adresse e-mail du client est invalide.");
  if ((kind === "programmation" || kind === "rappel") && !order.scheduledDate) throw new UserError("Programmez d'abord la date avant d'envoyer ce message.");
  const settings = await getSettings();
  // Le bon de commande part avec le lien de signature (créé ici pour les commandes plus anciennes).
  if (kind === "bon" && !order.signToken) order.signToken = await mutate((db) => (findOrder(db, orderId).signToken ||= signToken()));
  const mail = buildEmail(kind, order, settings, kind === "bon" ? await signUrl(order) : "");
  const attachments = kind === "bon" ? [{ filename: `Bon de commande ${order.number}.pdf`, content: await renderDeliveryNote(order, settings), contentType: "application/pdf" }] : undefined;
  await sendMail({ to, ...mail, attachments });
  await mutate((db) => {
    const target = findOrder(db, orderId);
    target.emails.push({ at: now(), kind, to });
    if (kind === "rappel") target.reminded = true;
    log(target, `E-mail envoyé à ${to} : ${EMAIL_KINDS[kind].label.toLowerCase()}`);
  });
}

/** Crée le lien de signature d'une commande qui n'en a pas encore (bouton de la fiche commande). */
export async function createSignLink(orderId: string): Promise<void> {
  await run(() => mutate((db) => void (findOrder(db, orderId).signToken ||= signToken())));
}

/** Envoi d'un message au client depuis la fiche commande ou l'espace livraison. */
export async function sendOrderEmail(orderId: string, kind: string) {
  return run(async () => {
    if (!isEmailKind(kind)) throw new UserError("Message inconnu.");
    if ((await currentScope()) === "test") {
      // En mode test, rien ne part : on montre seulement ce qui se passerait.
      await mutate((db) => log(findOrder(db, orderId), `E-mail simulé (mode test) : ${EMAIL_KINDS[kind].label.toLowerCase()}`));
      return { simulated: true };
    }
    await deliverEmail(orderId, kind);
    return { simulated: false };
  });
}

/** Ajoute ou corrige l'adresse e-mail du client d'une commande. */
export async function setCustomerEmail(orderId: string, email: string) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      const value = clean(email, 120);
      if (value && !isEmail(value)) throw new UserError("Adresse e-mail invalide.");
      order.customer.email = value;
      log(order, value ? `Adresse e-mail du client : ${value}` : "Adresse e-mail du client retirée");
      return undefined;
    }),
  );
}

export async function scheduleOrder(orderId: string, date: string | null, slot: Slot, time = "") {
  return run(async () => {
    await mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status !== "active") throw new UserError("Cette commande est clôturée.");
      if (date !== null && !isDate(date)) throw new UserError("Date invalide.");
      order.scheduledDate = date;
      order.time = date ? cleanTime(time) : "";
      order.slot = order.time ? slotOfTime(order.time) : date && (slot === "matin" || slot === "apres-midi") ? slot : "";
      order.reminded = false;
      const what = isPickup(order) ? "Retrait" : "Livraison";
      log(order, date ? `${what} programmé${isPickup(order) ? "" : "e"} le ${frDate(date)}${order.time ? ` à ${hourLabel(order.time)}` : ""}` : `${what} déprogrammé${isPickup(order) ? "" : "e"}`);
    });
    if (date) await locate(orderId);
    return undefined;
  });
}

export async function setPrepared(orderId: string, prepared: boolean) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status !== "active") throw new UserError("Cette commande est clôturée.");
      // Le stock est indicatif : une commande se prépare même si un article n'y figure pas encore.
      order.prepared = prepared;
      order.preparedAt = prepared ? now() : null;
      log(order, prepared ? `Commande préparée par le magasin${isStockComplete(order) ? "" : " (un article n'était pas compté en stock)"}` : "Préparation annulée");
      return undefined;
    }),
  );
}

/** Enregistre le montant total déjà réglé par le client (acompte ou solde). */
export async function setPaid(orderId: string, amount: number) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status === "cancelled") throw new UserError("Cette commande est annulée.");
      const value = round2(Number(amount));
      if (!Number.isFinite(value) || value < 0) throw new UserError("Montant invalide.");
      const { total } = orderTotals(order);
      if (value > total) throw new UserError(`Le montant dépasse le total de la commande (${total.toFixed(2).replace(".", ",")} €).`);
      // Le détail des encaissements suit : une hausse ajoute une ligne, une baisse repart d'une ligne unique.
      if (value > order.paid) order.payments.push({ at: now(), amount: round2(value - order.paid), method: "", by: "magasin" });
      else if (value < order.paid) order.payments = value > 0 ? [{ at: now(), amount: value, method: "", by: "magasin" }] : [];
      order.paid = value;
      log(order, value >= total ? "Commande réglée en totalité" : `Montant réglé : ${value.toFixed(2).replace(".", ",")} €`);
      return undefined;
    }),
  );
}

/** Encaissement au magasin : ajoute un montant à ce qui est déjà réglé (calculé sur les données à jour). */
export async function addShopPayment(orderId: string, amount: number) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status === "cancelled") throw new UserError("Cette commande est annulée.");
      const value = round2(Number(amount));
      if (!Number.isFinite(value) || value <= 0) throw new UserError("Montant invalide.");
      const rest = round2(orderTotals(order).total - order.paid);
      if (value > rest) throw new UserError(`Le reste à payer n'est que de ${euros(rest)}.`);
      order.paid = round2(order.paid + value);
      order.payments.push({ at: now(), amount: value, method: "", by: "magasin" });
      log(order, rest - value <= 0 ? "Commande réglée en totalité" : `Encaissé au magasin : ${euros(value)}`);
      return undefined;
    }),
  );
}

/** Solde la commande : encaisse exactement ce qu'il reste à payer à cet instant. */
export async function settleOrder(orderId: string) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status === "cancelled") throw new UserError("Cette commande est annulée.");
      const rest = round2(orderTotals(order).total - order.paid);
      if (rest <= 0) return undefined;
      order.paid = round2(order.paid + rest);
      order.payments.push({ at: now(), amount: rest, method: "", by: "magasin" });
      log(order, "Commande réglée en totalité");
      return undefined;
    }),
  );
}

/** Encaissement par le livreur pendant sa tournée (espèces, carte, chèque…). */
export async function collectPayment(orderId: string, amount: number, method: PaymentMethod) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status === "cancelled") throw new UserError("Cette commande est annulée.");
      const value = round2(Number(amount));
      if (!Number.isFinite(value) || value <= 0) throw new UserError("Montant invalide.");
      if (!(method in PAYMENT_METHODS)) throw new UserError("Choisissez un mode de paiement.");
      const rest = round2(orderTotals(order).total - order.paid);
      if (value > rest) throw new UserError(`Le reste à payer n'est que de ${euros(rest)}.`);
      order.paid = round2(order.paid + value);
      order.payments.push({ at: now(), amount: value, method, by: "livreur" });
      log(order, `Encaissé par le livreur : ${euros(value)} (${PAYMENT_METHODS[method as keyof typeof PAYMENT_METHODS].toLowerCase()})`);
      return undefined;
    }),
  );
}

/** Prestation ajoutée sur place (montage en plus, étage supplémentaire…) : elle s'ajoute au total à payer. */
export async function addExtra(orderId: string, label: string, amount: number) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status === "cancelled") throw new UserError("Cette commande est annulée.");
      const text = clean(label, 120);
      if (!text) throw new UserError("Décrivez la prestation.");
      const value = round2(Number(amount));
      if (!Number.isFinite(value) || value <= 0 || value > 100000) throw new UserError("Montant invalide.");
      order.extras.push({ id: id(), label: text, amount: value, at: now() });
      log(order, `Prestation ajoutée : ${text} (${euros(value)})`);
      return undefined;
    }),
  );
}

export async function removeExtra(orderId: string, extraId: string) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      const extra = order.extras.find((e) => e.id === extraId);
      if (!extra) throw new UserError("Prestation introuvable.");
      const totalAfter = round2(orderTotals(order).total - extra.amount);
      if (order.paid > totalAfter) throw new UserError("Impossible : le client a déjà réglé cette prestation.");
      order.extras = order.extras.filter((e) => e.id !== extraId);
      log(order, `Prestation retirée : ${extra.label} (${euros(extra.amount)})`);
      return undefined;
    }),
  );
}

export async function setReminded(orderId: string, reminded: boolean) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      order.reminded = reminded;
      if (reminded) log(order, "Client prévenu de la date");
      return undefined;
    }),
  );
}

/** Clôture : livrée au client ou retirée sur place. */
export async function completeOrder(orderId: string) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status !== "active") throw new UserError("Cette commande est déjà clôturée.");
      // Le stock est indicatif : la livraison n'est jamais bloquée par un article non compté en stock.
      const missing = order.lines.filter((l) => !l.reserved);
      order.status = "done";
      order.doneAt = now();
      log(order, isPickup(order) ? "Commande retirée par le client" : "Commande livrée");
      if (missing.length) log(order, `Remis sans être compté en stock : ${missing.map((l) => `${l.quantity} × ${l.name}`).join(", ")}`);
      return undefined;
    }),
  );
}

export async function cancelOrder(orderId: string) {
  return run(() =>
    mutate((db) => {
      const order = findOrder(db, orderId);
      if (order.status !== "active") throw new UserError("Cette commande est déjà clôturée.");
      // Les articles réservés retournent en stock, puis servent les autres commandes en attente.
      for (const line of order.lines) {
        if (!line.reserved) continue;
        const article = db.articles.find((a) => a.id === line.articleId);
        if (article) article.stock += line.quantity;
        line.reserved = false;
      }
      order.status = "cancelled";
      order.doneAt = now();
      log(order, "Commande annulée, articles remis en stock");
      allocate(db);
      return undefined;
    }),
  );
}

/** Place une adresse saisie à la main sur la carte, sans rien enregistrer (départ ponctuel d'une tournée). */
export async function locateAddress(address: string) {
  return run(async () => {
    const value = clean(address, 200);
    if (value.length < 8) throw new UserError("Saisissez une adresse complète (numéro, rue, code postal, ville).");
    const geo = await geocode(value);
    if (!geo) throw new UserError("Adresse introuvable sur la carte. Vérifiez le numéro, la rue et la ville.");
    return { address: value, ...geo };
  });
}

/** Recherche les coordonnées des livraisons d'une journée et du dépôt (pour la carte du livreur). */
export async function locateDeliveries(date: string) {
  return run(async () => {
    const db = await loadDb();
    const settings = await getSettings();
    const depotAddress = settings.depotAddress.trim() || DEFAULT_SETTINGS.depotAddress;
    if (depotAddress && db.depot?.address !== depotAddress) {
      const geo = await geocode(depotAddress);
      if (geo) await mutate((fresh) => void (fresh.depot = { address: depotAddress, ...geo }));
    }
    const missing = db.orders.filter((o) => o.scheduledDate === date && !o.geo && !o.geoFailed && !isPickup(o) && o.status !== "cancelled");
    for (const order of missing.slice(0, 6)) {
      await locate(order.id);
      // Nominatim demande au plus une requête par seconde.
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    return undefined;
  });
}
