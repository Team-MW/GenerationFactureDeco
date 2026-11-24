import { dateLong, eur } from "../format";
import type { Settings } from "../types";
import { DELIVERY_MODES, PAYMENT_SENTENCE, fullAddress, hourLabel, isPickup, orderBalance } from "./logic";
import type { Order } from "./types";

/** Les quatre messages envoyés au client autour d'une commande. */
export type EmailKind = "bon" | "programmation" | "rappel" | "livree";

export const EMAIL_KINDS: Record<EmailKind, { label: string; hint: string }> = {
  bon: { label: "Bon de commande", hint: "Confirmation de commande, avec le bon en pièce jointe (PDF)" },
  programmation: { label: "Date de livraison", hint: "Annonce la date et l'heure prévues" },
  rappel: { label: "Rappel de livraison", hint: "À envoyer la veille ou le jour même" },
  livree: { label: "Livraison effectuée", hint: "Remerciement après la livraison ou le retrait" },
};

export const isEmailKind = (value: unknown): value is EmailKind => typeof value === "string" && value in EMAIL_KINDS;

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Content {
  subject: string;
  title: string;
  /** Paragraphes du message (texte simple). */
  lines: string[];
  /** Encadré de détails : libellé → valeur. */
  facts: [string, string][];
}

function content(kind: EmailKind, order: Order, settings: Settings): Content {
  const pickup = isPickup(order);
  const balance = orderBalance(order);
  const company = settings.companyName;
  const first = order.customer.name.trim().split(/\s+/).pop() ?? "";
  const hello = `Bonjour${first ? ` ${order.customer.name.trim()}` : ""},`;
  // « 24 novembre 2026 à 9h30 », « … dans la matinée », « … dans l'après-midi », ou la date seule.
  const moment = order.time ? ` à ${hourLabel(order.time)}` : order.slot === "matin" ? " dans la matinée" : order.slot === "apres-midi" ? " dans l'après-midi" : "";
  const when = order.scheduledDate ? `${dateLong(order.scheduledDate)}${moment}` : "";
  const mode = DELIVERY_MODES[order.delivery.mode].label;
  const articles = order.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ");
  const money: [string, string][] = [
    ["Total TTC", eur(balance.total)],
    ...(balance.paid > 0 ? ([["Déjà réglé", eur(balance.paid)]] as [string, string][]) : []),
    ["Reste à payer", balance.settled ? "0,00 € · commande réglée" : eur(balance.rest)],
  ];
  const place: [string, string][] = pickup ? [["Retrait", "Au magasin"]] : [["Adresse", fullAddress(order)], ["Formule", mode]];
  const contact = [settings.phone, settings.email].filter(Boolean).join(" · ");
  const question = contact ? `Pour toute question : ${contact}.` : "";

  switch (kind) {
    case "bon":
      return {
        subject: `Votre bon de commande ${order.number} – ${company}`,
        title: "Merci pour votre commande",
        lines: [hello, `Nous avons bien enregistré votre commande. Vous trouverez votre bon de commande en pièce jointe de ce message.`, question],
        facts: [["Commande", order.number], ["Articles", articles], ...place, ...(when ? ([[pickup ? "Retrait prévu" : "Livraison prévue", when]] as [string, string][]) : []), ...money],
      };
    case "programmation":
      return {
        subject: pickup ? `Votre retrait est prévu le ${when} – ${company}` : `Votre livraison est prévue le ${when} – ${company}`,
        title: pickup ? "Votre retrait est planifié" : "Votre livraison est programmée",
        lines: [
          hello,
          pickup ? `Votre commande ${order.number} sera prête au magasin le ${when}.` : `Votre commande ${order.number} vous sera livrée le ${when}.`,
          balance.settled ? "" : `Il restera ${eur(balance.rest)} à régler ${pickup ? "au retrait" : "à la livraison"} (${PAYMENT_SENTENCE}).`,
          `Si cette date ne vous convient pas, merci de nous prévenir au plus tôt. ${question}`.trim(),
        ],
        facts: [["Commande", order.number], [pickup ? "Retrait" : "Livraison", when], ...place, ["Articles", articles], ...money],
      };
    case "rappel":
      return {
        subject: pickup ? `Rappel : votre retrait du ${when} – ${company}` : `Rappel : votre livraison du ${when} – ${company}`,
        title: pickup ? "Rappel de votre retrait" : "Rappel de votre livraison",
        lines: [
          hello,
          pickup ? `Nous vous rappelons que votre commande ${order.number} vous attend au magasin le ${when}.` : `Nous vous rappelons que votre commande ${order.number} sera livrée le ${when}.`,
          pickup ? "" : "Merci de prévoir un accès dégagé et une personne présente à l'adresse de livraison.",
          balance.settled ? "" : `Montant à régler ${pickup ? "au retrait" : "à la livraison"} : ${eur(balance.rest)}.`,
          question,
        ],
        facts: [[pickup ? "Retrait" : "Livraison", when], ...place, ["Articles", articles], ...(balance.settled ? [] : ([["Reste à payer", eur(balance.rest)]] as [string, string][]))],
      };
    case "livree":
      return {
        subject: pickup ? `Votre commande ${order.number} a été retirée – ${company}` : `Votre commande ${order.number} a été livrée – ${company}`,
        title: "Merci de votre confiance",
        lines: [
          hello,
          pickup ? `Votre commande ${order.number} a bien été retirée.` : `Votre commande ${order.number} a bien été livrée.`,
          "Nous espérons que vos meubles vous donnent entière satisfaction. Si vous constatez la moindre anomalie, contactez-nous rapidement.",
          question,
        ],
        facts: [["Commande", order.number], ["Articles", articles], ...money],
      };
  }
}

/** Construit l'objet, la version HTML et la version texte d'un message. */
export function buildEmail(kind: EmailKind, order: Order, settings: Settings): { subject: string; html: string; text: string } {
  const c = content(kind, order, settings);
  const lines = c.lines.filter(Boolean);
  const accent = settings.accentColor;
  const footer = [settings.companyName, [settings.address, settings.postalCode, settings.city].filter(Boolean).join(" "), settings.phone, settings.email].filter(Boolean);

  const text = [c.title.toUpperCase(), "", ...lines.flatMap((l) => [l, ""]), ...c.facts.map(([k, v]) => `${k} : ${v}`), "", "—", ...footer].join("\n");

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f3f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f6;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${accent};padding:22px 28px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.3px;">${escape(settings.companyName)}</td></tr>
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f172a;">${escape(c.title)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#334155;">${escape(l)}</p>`).join("\n")}
</td></tr>
<tr><td style="padding:8px 28px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
${c.facts.map(([k, v], i) => `<tr><td style="padding:10px 14px;font-size:13px;color:#64748b;white-space:nowrap;vertical-align:top;${i ? "border-top:1px solid #e2e8f0;" : ""}">${escape(k)}</td><td style="padding:10px 14px;font-size:14px;font-weight:600;color:#0f172a;text-align:right;${i ? "border-top:1px solid #e2e8f0;" : ""}">${escape(v)}</td></tr>`).join("\n")}
</table>
</td></tr>
<tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b;">${footer.map(escape).join(" · ")}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject: c.subject, html, text };
}
