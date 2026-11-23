"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, accessPassword, accessToken } from "@/lib/access";

/** Ne garde la destination que si c'est une page de ce site (pas d'adresse externe déguisée). */
function safeTarget(target: string): string {
  if (!target.startsWith("/") || /[\\\u0000-\u001f]/.test(target)) return "/";
  try {
    const url = new URL(target, "http://site.invalid");
    return url.origin === "http://site.invalid" ? url.pathname + url.search : "/";
  } catch {
    return "/";
  }
}

export async function login(_previous: { error: string }, form: FormData): Promise<{ error: string }> {
  const expected = accessPassword();
  const given = String(form.get("code") ?? "");
  const target = String(form.get("retour") ?? "/");
  if (expected) {
    const [a, b] = await Promise.all([accessToken(given), accessToken(expected)]);
    if (!timingSafeEqual(Buffer.from(a), Buffer.from(b))) {
      // Ralentit les essais en série.
      await new Promise((resolve) => setTimeout(resolve, 800));
      return { error: "Code incorrect." };
    }
    (await cookies()).set(ACCESS_COOKIE, b, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  redirect(safeTarget(target));
}

export async function logout() {
  (await cookies()).delete(ACCESS_COOKIE);
  redirect("/connexion");
}
