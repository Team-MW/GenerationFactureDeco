import { insertOrder, log } from "./build";
import { addDays, parisToday } from "./logic";
import type { Db, OrderInput } from "./types";

/**
 * Jeu de données du mode test : sept commandes fictives autour de Toulouse, datées par rapport
 * au jour où on les charge. Clients, adresses et montants sont inventés.
 */
export function demoDb(): Db {
  const db: Db = { articles: [], orders: [], counters: {}, depot: null };
  const today = parisToday();
  const customer = (name: string, phone: string, address = "", postalCode = "", city = "", notes = "") => ({ name, phone, email: "", address, postalCode, city, notes });
  const base = { shop: "toulouse" as const, observations: "", paid: 0, discount: { type: "percent" as const, value: 0 }, scheduledDate: null, slot: "" as const };

  const scenario: { input: OrderInput; geo?: { lat: number; lon: number }; prepared?: boolean }[] = [
    {
      input: { ...base, customer: customer("Benali Nadia", "06 00 00 00 01", "15 Avenue de la Gare", "31120", "Portet-sur-Garonne", "Maison, portail vert, sonner"), observations: "Délai 2 mois", paid: 500, lines: [{ newArticle: { name: "Table Marbella beige", reference: "MAR-BG", category: "Tables à manger", price: 1600, stock: 3 }, quantity: 1 }, { newArticle: { name: "Chaise Hailey noyer", reference: "HAI-NO", category: "Chaises", price: 100, stock: 20 }, quantity: 6 }], delivery: { mode: "montage", adjustment: 0, offered: true }, scheduledDate: today, time: "09:30" },
      geo: { lat: 43.5227, lon: 1.4011 },
      prepared: true,
    },
    {
      input: { ...base, customer: customer("Haddad Karim", "06 00 00 00 02", "10 Rue de Metz", "31000", "Toulouse", "3e étage, ascenseur"), paid: 1410, lines: [{ newArticle: { name: "Canapé d'angle Oslo gris", reference: "OSL-GR", category: "Canapés d’angle", price: 1290, stock: 3 }, quantity: 1 }], delivery: { mode: "etage", adjustment: 20, offered: false }, scheduledDate: today, time: "11:00" },
      geo: { lat: 43.6004, lon: 1.4445 },
    },
    {
      input: { ...base, customer: customer("Laurent Sophie", "06 00 00 00 03", "5 Avenue du Général de Gaulle", "31700", "Blagnac"), discount: { type: "percent", value: 10 }, lines: [{ newArticle: { name: "Buffet Lina chêne", reference: "LIN-CH", category: "Buffets", price: 800, stock: 4 }, quantity: 1 }], delivery: { mode: "porte", adjustment: 0, offered: false }, scheduledDate: today, time: "14:30" },
      geo: { lat: 43.6362, lon: 1.3906 },
    },
    {
      input: { ...base, customer: customer("Moreau Julie", "06 00 00 00 05"), paid: 200, lines: [{ articleId: "Chaise Hailey noyer", quantity: 2 }], delivery: { mode: "retrait", adjustment: 0, offered: false }, scheduledDate: today, slot: "matin" },
      prepared: true,
    },
    {
      input: { ...base, customer: customer("Dubois Marc", "06 00 00 00 04", "8 Allée du Rouergue", "31770", "Colomiers"), paid: 600, lines: [{ articleId: "Canapé d'angle Oslo gris", quantity: 1 }, { articleId: "Chaise Hailey noyer", quantity: 4 }], delivery: { mode: "montage", adjustment: 0, offered: false }, scheduledDate: addDays(today, 1), time: "10:00" },
      geo: { lat: 43.6112, lon: 1.3348 },
    },
    {
      input: { ...base, customer: customer("Cherif Yanis", "06 00 00 00 06", "3 Rue Clément Ader", "31600", "Muret"), observations: "Arrivage prévu début décembre", paid: 200, lines: [{ newArticle: { name: "Lit coffre Nova 160", reference: "NOV-160", category: "Lits", price: 690, stock: 0 }, quantity: 1 }], delivery: { mode: "etage", adjustment: 0, offered: false } },
      geo: { lat: 43.4607, lon: 1.3268 },
    },
    {
      input: { ...base, customer: customer("Petit Emma", "06 00 00 00 07", "Place du Capitole", "31000", "Toulouse"), paid: 100, lines: [{ articleId: "Buffet Lina chêne", quantity: 1 }], delivery: { mode: "porte", adjustment: 0, offered: false } },
      geo: { lat: 43.6045, lon: 1.4442 },
    },
  ];

  for (const step of scenario) {
    // Les articles déjà créés sont désignés par leur nom dans le scénario : on retrouve leur identifiant.
    const lines = step.input.lines.map((line) => (line.articleId ? { ...line, articleId: db.articles.find((a) => a.name === line.articleId)?.id } : line));
    const order = insertOrder(db, { ...step.input, lines }, "TEST");
    order.geo = step.geo ?? null;
    if (step.prepared) {
      order.prepared = true;
      order.preparedAt = new Date().toISOString();
      log(order, "Commande préparée par le magasin");
    }
  }
  return db;
}
