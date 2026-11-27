"use client";

import { MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Numéro de téléphone : chiffres uniquement, bloqué à 10 chiffres (numéro français, affiché « 06 12 34 56 78 »).
 * Un numéro étranger commence par « + » et accepte jusqu'à 15 chiffres.
 */
export function formatPhone(value: string): string {
  const raw = value.trim();
  if (raw.startsWith("+")) return `+${raw.replace(/\D/g, "").slice(0, 15)}`;
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/** true si le numéro est vide ou complet (10 chiffres commençant par 0, ou numéro étranger d'au moins 8 chiffres). */
export function phoneComplete(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;
  const digits = raw.replace(/\D/g, "");
  return raw.startsWith("+") ? digits.length >= 8 : digits.length === 10 && digits.startsWith("0");
}

export function PhoneInput({ value, onChange, className, required }: { value: string; onChange: (value: string) => void; className: string; required?: boolean }) {
  const complete = phoneComplete(value);
  return (
    <>
      <input
        className={className}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="06 12 34 56 78"
        maxLength={16}
        // Refuse l'enregistrement tant que le numéro n'a pas ses 10 chiffres.
        pattern="(0\d( \d{2}){4}|\+\d{8,15})"
        title="10 chiffres, par exemple 06 12 34 56 78"
        required={required}
        aria-invalid={!complete}
        value={value}
        onChange={(event) => onChange(formatPhone(event.target.value))}
      />
      {complete ? null : <span className="mt-1 block text-xs text-amber-700">Numéro incomplet : il faut 10 chiffres.</span>}
    </>
  );
}

export interface PickedAddress {
  address: string;
  postalCode: string;
  city: string;
}

interface Suggestion extends PickedAddress {
  label: string;
}

/**
 * Champ « numéro et rue » avec propositions d'adresses (Base Adresse Nationale, service public gratuit).
 * Seul le texte tapé dans ce champ est envoyé, jamais le nom ni le téléphone du client.
 */
export function AddressInput({ value, onChange, onPick, className, placeholder = "Numéro et rue", required }: { value: string; onChange: (value: string) => void; onPick: (picked: PickedAddress) => void; className: string; placeholder?: string; required?: boolean }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // On ne cherche que ce que la personne vient de taper, pas une adresse déjà choisie ou pré-remplie.
  const typed = useRef(false);
  const listId = useId();

  useEffect(() => {
    const query = value.trim();
    if (!typed.current || query.length < 4) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`https://data.geopf.fr/geocodage/search?autocomplete=1&limit=5&q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) return;
        const data: { features?: { properties?: { label?: string; name?: string; postcode?: string; city?: string } }[] } = await response.json();
        const found = (data.features ?? [])
          .map((feature) => feature.properties ?? {})
          .filter((p) => p.label && p.name)
          .map((p) => ({ label: p.label!, address: p.name!, postalCode: p.postcode ?? "", city: p.city ?? "" }));
        setSuggestions(found);
        setActive(-1);
        setOpen(true);
      } catch {
        // Service indisponible ou saisie remplacée : on continue à la main, sans propositions.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const pick = (suggestion: Suggestion) => {
    typed.current = false;
    onPick({ address: suggestion.address, postalCode: suggestion.postalCode, city: suggestion.city });
    setSuggestions([]);
    setOpen(false);
  };
  const shown = open && suggestions.length > 0;

  return (
    <div className="relative">
      <input
        className={className}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        onChange={(event) => {
          typed.current = true;
          onChange(event.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (!shown) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => (index + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
          } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            pick(suggestions[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {shown ? (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-40 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.label} role="option" aria-selected={index === active}>
              <button
                type="button"
                // mousedown : avant que le champ perde le focus et referme la liste
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(suggestion);
                }}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-slate-800 ${index === active ? "bg-slate-100" : "hover:bg-slate-50"}`}
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
