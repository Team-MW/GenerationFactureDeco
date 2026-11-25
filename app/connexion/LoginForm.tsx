"use client";

import { Loader2, LockKeyhole } from "lucide-react";
import { useActionState } from "react";
import { login } from "./actions";

export default function LoginForm({ target }: { target: string }) {
  const [state, action, pending] = useActionState(login, { error: "" });
  return (
    <form action={action} className="mt-8 flex flex-col gap-3">
      <input type="hidden" name="retour" value={target} />
      <label htmlFor="code" className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
        Code d&apos;accès
      </label>
      <input
        id="code"
        name="code"
        type="password"
        // Clavier à chiffres sur téléphone.
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="current-password"
        autoFocus
        required
        className="w-full rounded-xl border border-white/15 bg-neutral-950 px-4 py-3 text-center text-2xl tracking-[0.4em] text-white outline-none placeholder:text-neutral-600 focus:border-white"
      />
      {state.error ? (
        <p role="alert" className="text-sm text-rose-400">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}
        Entrer
      </button>
    </form>
  );
}
