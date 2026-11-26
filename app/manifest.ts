import type { MetadataRoute } from "next";

/** Installation sur l'écran d'accueil du téléphone : nom, couleurs et icône (logo DECOSHOP). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DECOSHOP · Gestion",
    short_name: "DECOSHOP",
    description: "Commandes, stock, livraisons et factures",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#012e87",
    theme_color: "#012e87",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
