"use client";

import { Check, Eye, Loader2, Mail, Send } from "lucide-react";
import { useState } from "react";
import { sendOrderEmail, setCustomerEmail } from "@/app/commandes/actions";
import { toast } from "@/lib/client";
import { EMAIL_KINDS, type EmailKind } from "@/lib/orders/emails";
import type { Order } from "@/lib/orders/types";
import { buttonSecondary } from "../ui";
import { useAction } from "./OrderActions";
import { inputClass } from "./bits";

const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Envoi d'un message au client ; utilisable dans la fiche commande et dans les rappels. */
export function useSendEmail() {
  const { pending, run } = useAction();
  const send = (order: Order, kind: EmailKind) =>
    run(async () => {
      const result = await sendOrderEmail(order.id, kind);
      if (result.ok) toast(result.data.simulated ? "Mode test : e-mail simulé, rien n'a été envoyé" : `E-mail envoyé à ${order.customer.email}`, result.data.simulated ? "info" : "success");
      return result;
    });
  return { pending, send };
}

/** Bloc « E-mails au client » de la fiche commande. */
export default function EmailPanel({ order, configured, testMode }: { order: Order; configured: boolean; testMode: boolean }) {
  const { pending: saving, run } = useAction();
  const { pending, send } = useSendEmail();
  const [email, setEmail] = useState(order.customer.email);
  const hasEmail = Boolean(order.customer.email);
  const kinds = (Object.keys(EMAIL_KINDS) as EmailKind[]).filter((k) => (k === "livree" ? order.status === "done" : true));

  if (order.status === "cancelled") return <p className="text-sm text-slate-500">Commande annulée : aucun e-mail ne peut être envoyé.</p>;

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => setCustomerEmail(order.id, email), "Adresse e-mail enregistrée");
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Adresse e-mail du client</span>
          <input type="email" inputMode="email" className={inputClass} placeholder="adresse@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" disabled={saving || email.trim() === order.customer.email} className={buttonSecondary} aria-label="Enregistrer l'adresse e-mail">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        </button>
      </form>

      {!configured && !testMode ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          L&apos;envoi d&apos;e-mails n&apos;est pas encore configuré (variables SMTP). Vous pouvez déjà consulter l&apos;aperçu des messages.
        </p>
      ) : null}
      {testMode ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Mode test : les envois sont simulés, aucun e-mail ne part.</p> : null}

      <ul className="mt-3 divide-y divide-slate-100">
        {kinds.map((kind) => {
          const last = [...order.emails].reverse().find((e) => e.kind === kind);
          const needsDate = (kind === "programmation" || kind === "rappel") && !order.scheduledDate;
          return (
            <li key={kind} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900">{EMAIL_KINDS[kind].label}</div>
                <div className="text-xs text-slate-500">{last ? `Envoyé le ${when(last.at)}` : needsDate ? "Disponible une fois la date fixée" : EMAIL_KINDS[kind].hint}</div>
              </div>
              <a href={`/api/commandes/${order.id}/email?type=${kind}`} target="_blank" rel="noreferrer" title="Aperçu du message" aria-label={`Aperçu du message « ${EMAIL_KINDS[kind].label} »`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
                <Eye size={16} />
              </a>
              <button
                type="button"
                disabled={pending || !hasEmail || needsDate || (!configured && !testMode)}
                onClick={() => send(order, kind)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-40"
              >
                {pending ? <Loader2 size={14} className="animate-spin" /> : last ? <Mail size={14} /> : <Send size={14} />} {last ? "Renvoyer" : "Envoyer"}
              </button>
            </li>
          );
        })}
      </ul>
      {!hasEmail ? <p className="mt-2 text-xs text-slate-500">Renseignez l&apos;adresse e-mail du client pour activer les envois.</p> : null}
    </div>
  );
}
