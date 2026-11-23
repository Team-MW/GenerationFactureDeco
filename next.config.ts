import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  turbopack: { root: __dirname },
  devIndicators: false,
  // Les fichiers source et le logo doivent accompagner les fonctions serveur une fois déployé.
  outputFileTracingIncludes: { "/**": ["./data/**/*"] },
  // Les PDF déjà générés en local n'ont pas à être embarqués : ils sont recréés à la demande.
  outputFileTracingExcludes: { "/**": ["./factures/**/*", "./*.xlsx", "./*.png"] },
};

export default nextConfig;
