import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import NavProgress from "@/components/NavProgress";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "DECOSHOP · Gestion",
  description: "Gestion des commandes et facturation Lenbox",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="font-sans">
        <NavProgress />
        {children}
      </body>
    </html>
  );
}
