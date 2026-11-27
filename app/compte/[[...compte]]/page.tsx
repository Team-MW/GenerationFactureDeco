import { SignIn } from "@clerk/nextjs";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import InstallButton from "@/app/connexion/InstallButton";
import { CLERK_ON } from "@/lib/clerk";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion" };

/** Première étape : se connecter avec son compte. Le code d'accès est demandé juste après. */
export default async function AccountPage() {
  if (!CLERK_ON) notFound();
  return (
    <main className="grid min-h-full place-items-center bg-black px-5 py-10 text-white">
      <div className="flex w-full max-w-sm flex-col items-center">
        <div className="self-start text-lg font-semibold tracking-tight">{(await getSettings()).companyName}</div>
        <h1 className="mt-6 self-start text-3xl font-semibold tracking-tight">Espace de gestion</h1>
        <p className="mb-6 mt-2 self-start text-sm text-neutral-400">Connectez-vous avec votre compte. Le code d&apos;accès vous sera demandé ensuite.</p>
        <Suspense>
          <SignIn routing="path" path="/compte" fallbackRedirectUrl="/" />
        </Suspense>
        <div className="w-full">
          <InstallButton />
        </div>
      </div>
    </main>
  );
}
