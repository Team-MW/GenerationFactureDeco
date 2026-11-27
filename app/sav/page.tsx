import { ArrowLeft, Wrench } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "SAV" };

/** Espace SAV : emplacement réservé, le fonctionnement reste à définir. */
export default function SavPage() {
  return (
    <main className="grid min-h-full place-items-center bg-black px-5 py-10 text-white">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/10">
          <Wrench size={26} strokeWidth={1.6} />
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">SAV</h1>
        <p className="mt-3 text-sm text-neutral-400">
          L&apos;espace service après-vente est en préparation. Il servira à suivre les réclamations, les retours et les réparations des clients.
        </p>
        <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium transition hover:bg-white/10">
          <ArrowLeft size={16} /> Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
