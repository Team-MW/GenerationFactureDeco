import nodemailer, { type Transporter } from "nodemailer";

/**
 * Envoi d'e-mails par SMTP. Tout se règle par variables d'environnement :
 *
 *   SMTP_HOST       serveur d'envoi                  ex. smtp.gmail.com, ssl0.ovh.net
 *   SMTP_PORT       port                             587 (STARTTLS, par défaut) ou 465 (SSL)
 *   SMTP_SECURE     « true » pour une connexion SSL  facultatif : déduit du port (465 = SSL)
 *   SMTP_USER       identifiant de la boîte          souvent l'adresse e-mail complète
 *   SMTP_PASSWORD   mot de passe de la boîte         (ou « mot de passe d'application » chez Gmail)
 *   MAIL_FROM       expéditeur affiché               ex. DECOSHOP <contact@decoshop.fr>
 *   MAIL_REPLY_TO   adresse de réponse               facultatif
 *   MAIL_BCC        copie cachée de chaque envoi     facultatif (pour garder une trace)
 */
const env = process.env;
/**
 * Valeur d'une variable, nettoyée : espaces autour et guillemets d'encadrement retirés.
 * Chez un hébergeur, une valeur collée avec ses guillemets ("mot de passe") est transmise telle quelle,
 * guillemets compris, et le serveur d'e-mail refuse alors l'identification.
 */
const value = (name: string) => (env[name] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const port = Number(value("SMTP_PORT")) || 587;
const host = value("SMTP_HOST");
const config = {
  host,
  port,
  secure: value("SMTP_SECURE") ? value("SMTP_SECURE") === "true" : port === 465,
  user: value("SMTP_USER"),
  // Gmail affiche ses mots de passe d'application par groupes de quatre lettres : les espaces n'en font pas partie.
  password: /gmail\.com$|googlemail\.com$/i.test(host) ? value("SMTP_PASSWORD").replace(/\s+/g, "") : value("SMTP_PASSWORD"),
  from: value("MAIL_FROM") || value("SMTP_USER"),
  replyTo: value("MAIL_REPLY_TO"),
  bcc: value("MAIL_BCC"),
};

export const MAIL_CONFIGURED = Boolean(config.host && config.from);

export class MailError extends Error {}

const mask = (value: string) => (value.length <= 4 ? value : `${value.slice(0, 2)}•••${value.slice(value.indexOf("@") > 0 ? value.indexOf("@") : -2)}`);

/** État de la configuration, sans jamais exposer le mot de passe. */
export function mailStatus() {
  return {
    configured: MAIL_CONFIGURED,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user ? mask(config.user) : "",
    hasPassword: Boolean(config.password),
    from: config.from,
    replyTo: config.replyTo,
    bcc: config.bcc,
  };
}

export const isEmail = (value: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(value.trim());

const globals = globalThis as unknown as { __mailer?: Transporter };

function transporter(): Transporter {
  globals.__mailer ??= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
  });
  return globals.__mailer;
}

/** Traduit une erreur SMTP en message compréhensible. */
function explain(error: unknown): MailError {
  const e = error as { code?: string; responseCode?: number; message?: string };
  console.error("[mail]", e?.code ?? "", e?.responseCode ?? "", e?.message ?? error);
  if (e?.code === "EAUTH" || e?.responseCode === 535) return new MailError("Le serveur d'e-mail refuse l'identifiant ou le mot de passe (SMTP_USER / SMTP_PASSWORD).");
  if (e?.code === "ECONNECTION" || e?.code === "ETIMEDOUT" || e?.code === "ESOCKET" || e?.code === "EDNS" || e?.code === "ENOTFOUND") {
    return new MailError("Impossible de joindre le serveur d'e-mail (vérifiez SMTP_HOST, SMTP_PORT et SMTP_SECURE).");
  }
  if (e?.code === "EENVELOPE" || (e?.responseCode && e.responseCode >= 550)) return new MailError("Le serveur d'e-mail a refusé cette adresse de destinataire ou d'expéditeur (MAIL_FROM).");
  return new MailError("L'e-mail n'a pas pu être envoyé. Réessayez dans un instant.");
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!MAIL_CONFIGURED) throw new MailError("L'envoi d'e-mails n'est pas configuré : renseignez les variables SMTP_HOST, SMTP_USER, SMTP_PASSWORD et MAIL_FROM.");
  if (!isEmail(mail.to)) throw new MailError("L'adresse e-mail du destinataire est invalide.");
  try {
    await transporter().sendMail({
      from: config.from,
      to: mail.to.trim(),
      replyTo: config.replyTo || undefined,
      bcc: config.bcc || undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.attachments,
    });
  } catch (error) {
    throw explain(error);
  }
}
