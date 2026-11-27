"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, accessPassword, accessToken } from "@/lib/access";
import { TEST_COOKIE, resetTestData } from "@/lib/orders/store";
import { resetTestSav } from "@/lib/sav/store";

async function allowed(): Promise<boolean> {
  const password = accessPassword();
  return !password || (await cookies()).get(ACCESS_COOKIE)?.value === (await accessToken(password));
}

/** Active ou quitte le mode test sur cet appareil. */
export async function setTestMode(on: boolean) {
  if (!(await allowed())) return;
  const jar = await cookies();
  if (on) jar.set(TEST_COOKIE, "test", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  else jar.delete(TEST_COOKIE);
  revalidatePath("/", "layout");
}

/** Recharge la simulation de départ (commandes fictives datées d'aujourd'hui). */
export async function resetSimulation(): Promise<{ ok: boolean; error?: string }> {
  if (!(await allowed())) return { ok: false, error: "Session expirée : reconnectez-vous." };
  try {
    await resetTestData();
    await resetTestSav();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Réinitialisation impossible." };
  }
}
