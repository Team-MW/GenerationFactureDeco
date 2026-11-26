import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import ConfirmDialog from "@/components/ConfirmDialog";
import NavProgress from "@/components/NavProgress";
import { Toaster } from "@/components/orders/SectionShell";
import { TestBanner } from "@/components/TestMode";
import { currentScope } from "@/lib/orders/store";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "DECOSHOP · Gestion",
  description: "Gestion des commandes et facturation Lenbox",
  // Ajoutée à l'écran d'accueil du téléphone, l'application s'ouvre en plein écran sous son nom.
  appleWebApp: { capable: true, title: "DECOSHOP", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="flex h-dvh flex-col overflow-hidden font-sans">
        <NavProgress />
        <ConfirmDialog />
        <Toaster />
        {(await currentScope()) === "test" ? <TestBanner /> : null}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </body>
    </html>
  );
}
