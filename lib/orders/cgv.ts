/**
 * Conditions générales de vente imprimées au verso du bon de commande.
 * Texte repris du modèle papier du magasin : à modifier ici si les conditions changent.
 */
export const CGV: { title: string; lines: string[] }[] = [
  {
    title: "1. CHAMP D'APPLICATION",
    lines: [
      "Les présentes CGV s'appliquent à toutes les ventes de meubles et d'articles de décoration réalisées par SAS DECOSHOP, en magasin ou en ligne, en France.",
    ],
  },
  {
    title: "2. PRIX ET MODALITÉS DE PAIEMENT",
    lines: [
      "Tous les prix sont indiqués en euros (€) et incluent la TVA.",
      "Modes de paiement acceptés : espèces, carte bancaire, virement bancaire.",
      "Un acompte de 30 % à 50 % peut être exigé lors de la commande.",
    ],
  },
  {
    title: "3. LIVRAISON ET RÉCEPTION",
    lines: [
      "La livraison est effectuée à l'adresse indiquée par le client.",
      "L'acheteur doit vérifier la marchandise à réception et signaler toute anomalie le jour même.",
    ],
  },
  {
    title: "4. DROIT DE RÉTRACTATION",
    lines: [
      "Une commande en magasin ne peut être annulée, le droit de rétractation ne s'applique pas.",
      "Pour le délai de livraison, tout dépend si ce délai figurait ou pas dans le bon de commande.",
      "Le consommateur dispose d'un délai de 14 jours pour exercer son droit de rétractation conformément au Code de la consommation.",
      "Les frais de retour sont à la charge du client, et le produit doit être retourné en parfait état et dans son emballage d'origine.",
    ],
  },
  {
    title: "5. GARANTIES ET RESPONSABILITÉ",
    lines: [
      "Les produits bénéficient d'une garantie légale de conformité de 6 mois contre les défauts cachés et non-conformités.",
      "SAS DECOSHOP décline toute responsabilité en cas de mauvaise utilisation ou d'installation incorrecte.",
    ],
  },
  {
    title: "6. FORCE MAJEURE",
    lines: [
      "SAS DECOSHOP ne saurait être tenue responsable en cas de retard ou de non-exécution en raison d'événements indépendants de sa volonté (catastrophes naturelles, grèves, crises sanitaires, retard en douane, retard de transport, etc.).",
    ],
  },
  {
    title: "7. LITIGES ET DROIT APPLICABLE",
    lines: [
      "Les présentes CGV sont régies par le droit français.",
      "En cas de litige, un recours à la médiation est possible avant toute action en justice.",
    ],
  },
];

export const TAGLINE = "Mobilier design et tendance";
