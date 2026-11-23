import { getSettings } from "@/lib/settings";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const { retour } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-black px-5 text-white">
      <div className="w-full max-w-sm">
        <div className="text-lg font-semibold tracking-tight">{(await getSettings()).companyName}</div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Espace de gestion</h1>
        <p className="mt-2 text-sm text-neutral-400">Saisissez le code d&apos;accès pour continuer.</p>
        <LoginForm target={retour ?? "/"} />
      </div>
    </main>
  );
}
