"use server";

import { cookies } from "next/headers";
import { ACCESS_COOKIE, accessPassword, accessToken } from "@/lib/access";
import { MailError, sendMail } from "@/lib/mail";
import { getSettings } from "@/lib/settings";

/** Envoie un e-mail d'essai pour vérifier la configuration SMTP. */
export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  const password = accessPassword();
  if (password && (await cookies()).get(ACCESS_COOKIE)?.value !== (await accessToken(password))) {
    return { ok: false, error: "Session expirée : reconnectez-vous." };
  }
  try {
    const { companyName } = await getSettings();
    await sendMail({
      to,
      subject: `Essai d'envoi – ${companyName}`,
      text: `Bonjour,\n\nCeci est un e-mail d'essai envoyé depuis l'application ${companyName}.\nSi vous le recevez, l'envoi par SMTP fonctionne.`,
      html: `<p style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a">Bonjour,</p><p style="font-family:Arial,sans-serif;font-size:15px;color:#334155">Ceci est un e-mail d'essai envoyé depuis l'application <b>${companyName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</b>.<br>Si vous le recevez, l'envoi par SMTP fonctionne.</p>`,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof MailError ? error.message : "Envoi impossible." };
  }
}
