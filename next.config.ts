import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "nodemailer"],
  turbopack: { root: __dirname },
  devIndicators: false,
  // Anciennes adresses (avant la page d'accueil) : redirigées vers l'espace Lenbox.
  async redirects() {
    return [
      ...["factures", "import"].map((page) => ({ source: `/${page}`, destination: `/lenbox/${page}`, permanent: false })),
      // Les paramètres sont communs à tout le logiciel.
      { source: "/lenbox/parametres", destination: "/parametres", permanent: false },
    ];
  },
  // Les fichiers source et le logo doivent accompagner les fonctions serveur une fois déployé.
  outputFileTracingIncludes: { "/**": ["./data/**/*"] },
  // Les PDF déjà générés en local n'ont pas à être embarqués : ils sont recréés à la demande.
  outputFileTracingExcludes: { "/**": ["./factures/**/*", "./*.xlsx", "./*.png"] },
};

export default nextConfig;
