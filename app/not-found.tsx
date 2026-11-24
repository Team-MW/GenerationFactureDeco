import Link from "next/link";

export const metadata = { title: "Page introuvable" };

export default function NotFound() {
  return (
    <main className="grid min-h-full place-items-center bg-black px-5 py-16 text-white">
      <div className="w-full max-w-md">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Erreur 404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Cette page n&apos;existe pas</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          L&apos;adresse est incorrecte, ou l&apos;élément a été supprimé. Si vous cherchiez une commande, vérifiez que vous êtes dans le bon mode : une
          commande de test n&apos;existe pas dans les vraies données, et inversement.
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-neutral-200">
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
