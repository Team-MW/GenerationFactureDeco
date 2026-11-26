"use client";

import { Loader2, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buttonPrimary } from "../ui";

/**
 * Imprime un PDF sans quitter la page : il est chargé dans un cadre invisible, puis la fenêtre d'impression s'ouvre.
 * Sur les appareils qui ne savent pas imprimer un PDF de cette façon (téléphones), il s'ouvre dans un nouvel onglet.
 */
export default function PrintButton({ href, label = "Imprimer", className = buttonPrimary }: { href: string; label?: string; className?: string }) {
  const [pending, setPending] = useState(false);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const address = useRef<string | null>(null);

  const cleanup = () => {
    frame.current?.remove();
    frame.current = null;
    if (address.current) URL.revokeObjectURL(address.current);
    address.current = null;
  };
  useEffect(() => cleanup, []);

  const print = async () => {
    const touch = typeof navigator !== "undefined" && (navigator.maxTouchPoints > 1 || /iPhone|iPad|Android/i.test(navigator.userAgent));
    if (touch) return void window.open(href, "_blank", "noopener");
    setPending(true);
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      cleanup();
      // Un PDF chargé depuis la mémoire du navigateur s'imprime de façon fiable, quel que soit le lecteur PDF intégré.
      address.current = URL.createObjectURL(await response.blob());
      const element = document.createElement("iframe");
      element.title = "Impression du bon de commande";
      element.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      element.onload = () => {
        setPending(false);
        try {
          element.contentWindow?.focus();
          element.contentWindow?.print();
        } catch {
          window.open(href, "_blank", "noopener");
        }
      };
      element.src = address.current;
      document.body.appendChild(element);
      frame.current = element;
    } catch {
      setPending(false);
      window.open(href, "_blank", "noopener");
    }
  };

  return (
    <button type="button" onClick={print} disabled={pending} className={className}>
      {pending ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} {label}
    </button>
  );
}
