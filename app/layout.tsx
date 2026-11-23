import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Shell from "@/components/Shell";
import { getSettings } from "@/lib/settings";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Facturation",
  description: "Génération automatique de factures et tableau de bord",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { companyName } = getSettings();
  return (
    <html lang="fr" className={inter.variable}>
      <body className="font-sans">
        <Shell companyName={companyName}>{children}</Shell>
      </body>
    </html>
  );
}
