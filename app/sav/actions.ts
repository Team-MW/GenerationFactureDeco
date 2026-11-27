"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACCESS_COOKIE, accessPassword, accessToken } from "@/lib/access";
import { UserError, clean, euros, frDate, id, isDate, now } from "@/lib/orders/build";
import { hourLabel } from "@/lib/orders/logic";
import { refundOrder } from "@/app/commandes/actions";
import { getSav } from "@/lib/sav/store";
import { StoreError } from "@/lib/orders/store";
import type { Result } from "@/lib/orders/types";
import { cleanMoment, mutateSav } from "@/lib/sav/store";
import { SAV_KINDS, type SavDb, type SavInput, type SavTicket } from "@/lib/sav/types";

/** Exécute une action et renvoie toujours un résultat lisible par l'interface. */
async function run<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    // Deuxième verrou, en plus du contrôle à l'entrée du site : aucune action sans le code d'accès.
    const password = accessPassword();
    if (password && (await cookies()).get(ACCESS_COOKIE)?.value !== (await accessToken(password))) {
      return { ok: false, error: "Session expirée : reconnectez-vous." };
    }
    const data = await work();
    revalidatePath("/sav");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof UserError || error instanceof StoreError) return { ok: false, error: error.message };
    console.error("[sav]", error);
    return { ok: false, error: "Une erreur est survenue. Réessayez." };
  }
}

function find(db: SavDb, ticketId: string): SavTicket {
  const ticket = db.tickets.find((t) => t.id === ticketId);
  if (!ticket) throw new UserError("Demande introuvable.");
  return ticket;
}

const log = (ticket: SavTicket, text: string) => ticket.history.push({ at: now(), text });
const momentText = (moment: string) => (moment === "matin" ? "le matin" : moment === "apres-midi" ? "l'après-midi" : moment ? `à ${hourLabel(moment)}` : "dans la journée");

/** Crée une demande de SAV, ou modifie une demande existante. */
export async function saveSavTicket(input: SavInput) {
  return run(async () => {
    const customer = {
      name: clean(input.customer?.name, 120),
      phone: clean(input.customer?.phone, 40),
      email: clean(input.customer?.email, 160),
      address: clean(input.customer?.address, 200),
      postalCode: clean(input.customer?.postalCode, 12),
      city: clean(input.customer?.city, 80),
    };
    const problem = clean(input.problem, 2000);
    if (!customer.name) throw new UserError("Indiquez le nom du client.");
    if (!problem) throw new UserError("Décrivez le problème signalé par le client.");
    const fields = { customer, orderNumber: clean(input.orderNumber, 40), product: clean(input.product, 200), kind: input.kind in SAV_KINDS ? input.kind : ("autre" as const), problem };
    return mutateSav((db) => {
      if (input.id) {
        const ticket = find(db, input.id);
        Object.assign(ticket, fields);
        log(ticket, "Demande modifiée");
        return ticket.number;
      }
      db.counter += 1;
      const ticket: SavTicket = {
        id: id(),
        number: `SAV-${String(db.counter).padStart(4, "0")}`,
        createdAt: now(),
        ...fields,
        status: "nouvelle",
        visitDate: null,
        visitMoment: "",
        technician: "",
        visitNote: "",
        report: "",
        doneAt: null,
        refunded: null,
        history: [{ at: now(), text: "Demande enregistrée" }],
      };
      db.tickets.push(ticket);
      return ticket.number;
    });
  });
}

/** Fixe (ou retire, avec date = null) le rendez-vous chez le client. */
export async function scheduleSavVisit(ticketId: string, date: string | null, moment: string, technician: string, note: string) {
  return run(async () => {
    if (date !== null && !isDate(date)) throw new UserError("Choisissez une date de rendez-vous.");
    return mutateSav((db) => {
      const ticket = find(db, ticketId);
      if (ticket.status === "terminee" || ticket.status === "annulee") throw new UserError("Cette demande est close : rouvrez-la pour fixer un rendez-vous.");
      if (date === null) {
        ticket.visitDate = null;
        ticket.visitMoment = "";
        ticket.status = "nouvelle";
        log(ticket, "Rendez-vous retiré");
        return;
      }
      ticket.visitDate = date;
      ticket.visitMoment = cleanMoment(moment);
      ticket.technician = clean(technician, 80);
      ticket.visitNote = clean(note, 500);
      ticket.status = "planifiee";
      log(ticket, `Rendez-vous fixé le ${frDate(date)} ${momentText(ticket.visitMoment)}${ticket.technician ? ` · ${ticket.technician}` : ""}`);
    });
  });
}

/** Clôt la demande, avec un compte rendu de ce qui a été fait. */
export async function closeSavTicket(ticketId: string, report: string) {
  return run(async () =>
    mutateSav((db) => {
      const ticket = find(db, ticketId);
      ticket.status = "terminee";
      ticket.report = clean(report, 2000);
      ticket.doneAt = now();
      log(ticket, "Demande terminée");
    }),
  );
}

/**
 * Valide le remboursement : la commande reliée est marquée remboursée (elle sort de tous les chiffres),
 * puis la demande est terminée avec le montant rendu.
 */
export async function refundSavTicket(ticketId: string, amount: number, restock: boolean) {
  return run(async () => {
    const ticket = find(await getSav(), ticketId);
    if (ticket.refunded !== null) throw new UserError("Le remboursement de cette demande est déjà validé.");
    if (!ticket.orderNumber) throw new UserError("Reliez d'abord la demande à un bon de commande.");
    const result = await refundOrder(ticket.orderNumber, amount, restock, ticket.number);
    if (!result.ok) throw new UserError(result.error);
    const value = Math.round(Number(amount) * 100) / 100;
    return mutateSav((db) => {
      const current = find(db, ticketId);
      current.refunded = value;
      current.status = "terminee";
      current.doneAt = now();
      const line = `Remboursement validé : ${euros(value)} rendus au client${restock ? ", articles remis en stock" : ""}.`;
      current.report = current.report ? `${current.report}\n${line}` : line;
      log(current, `Remboursement validé (${euros(value)}) · commande ${current.orderNumber} sortie des chiffres`);
    });
  });
}

export async function cancelSavTicket(ticketId: string) {
  return run(async () =>
    mutateSav((db) => {
      const ticket = find(db, ticketId);
      ticket.status = "annulee";
      ticket.doneAt = now();
      log(ticket, "Demande annulée");
    }),
  );
}

/** Rouvre une demande terminée ou annulée. */
export async function reopenSavTicket(ticketId: string) {
  return run(async () =>
    mutateSav((db) => {
      const ticket = find(db, ticketId);
      ticket.status = ticket.visitDate ? "planifiee" : "nouvelle";
      ticket.doneAt = null;
      log(ticket, "Demande rouverte");
    }),
  );
}

export async function deleteSavTicket(ticketId: string) {
  return run(async () =>
    mutateSav((db) => {
      find(db, ticketId);
      db.tickets = db.tickets.filter((t) => t.id !== ticketId);
    }),
  );
}
