"use client";

import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { sendTestEmail } from "@/app/mail/actions";
import { toast } from "@/lib/client";
import { Card, CardHeader, buttonPrimary } from "./ui";

interface Status {
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  from: string;
  replyTo: string;
  bcc: string;
}

/** État de la configuration SMTP (lue dans les variables d'environnement) et envoi d'un e-mail d'essai. */
export default function MailSettings({ status }: { status: Status }) {
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const rows: [string, string, boolean][] = [
    ["SMTP_HOST", status.host || "non renseigné", Boolean(status.host)],
    ["SMTP_PORT", `${status.port} · ${status.secure ? "connexion SSL" : "STARTTLS"}`, true],
    ["SMTP_USER", status.user || "non renseigné", Boolean(status.user)],
    ["SMTP_PASSWORD", status.hasPassword ? "renseigné (masqué)" : "non renseigné", status.hasPassword],
    ["MAIL_FROM", status.from || "non renseigné", Boolean(status.from)],
    ["MAIL_REPLY_TO", status.replyTo || "facultatif", true],
    ["MAIL_BCC", status.bcc || "facultatif", true],
  ];
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    const result = await sendTestEmail(to);
    setSending(false);
    toast(result.ok ? `E-mail d'essai envoyé à ${to}` : (result.error ?? "Envoi impossible"), result.ok ? "success" : "error");
  };
  return (
    <Card>
      <CardHeader title="Envoi d'e-mails (SMTP)" hint="Bons de commande et messages de livraison envoyés aux clients" />
      <div className="p-4 md:p-5">
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${status.configured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          {status.configured ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {status.configured ? "Configuration détectée" : "Non configuré : renseignez les variables ci-dessous puis redémarrez l'application"}
        </div>
        <dl className="mt-3 divide-y divide-slate-100 text-sm">
          {rows.map(([name, value, ok]) => (
            <div key={name} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="font-mono text-xs text-slate-600">{name}</dt>
              <dd className={`min-w-0 truncate text-right ${ok ? "text-slate-900" : "text-amber-800"}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <form onSubmit={send} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
          <label className="min-w-[200px] flex-1">
            <span className="mb-1.5 block text-xs font-medium text-slate-700">Envoyer un e-mail d&apos;essai à</span>
            <input
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="vous@exemple.fr"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-neutral-200 md:text-sm"
            />
          </label>
          <button type="submit" disabled={sending || !status.configured} className={buttonPrimary}>
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Envoyer l&apos;essai
          </button>
        </form>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Ces réglages se font dans le fichier <code className="rounded bg-slate-100 px-1">.env.local</code> en local, et dans Vercel (Settings → Environment Variables) pour la
          version en ligne. Le mot de passe n&apos;est jamais affiché ni enregistré en base.
        </p>
      </div>
    </Card>
  );
}
