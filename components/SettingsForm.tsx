"use client";

import { ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/client";
import type { Settings } from "@/lib/types";
import { Card, CardHeader, buttonPrimary, buttonSecondary } from "./ui";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 md:text-sm outline-none placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-neutral-200";

function Field({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-black" />
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

export default function SettingsForm({ initial, hasLogo, sampleId }: { initial: Settings; hasLogo: boolean; sampleId: string | null }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [logo, setLogo] = useState(hasLogo);
  const [logoStamp, setLogoStamp] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const text = (key: keyof Settings, placeholder = "") => ({
    className: inputClass,
    placeholder,
    value: String(values[key] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/parametres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setValues(result);
      toast("Paramètres enregistrés · factures mises à jour");
      router.refresh();
    } catch (error) {
      toast((error instanceof Error && error.message) || "Enregistrement impossible", "error");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    const body = new FormData();
    body.append("logo", file);
    const response = await fetch("/api/parametres/logo", { method: "POST", body });
    if (response.ok) {
      setLogo(true);
      setLogoStamp(Date.now());
      toast("Logo enregistré");
    } else {
      toast((await response.json()).error ?? "Logo refusé", "error");
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const deleteLogo = async () => {
    const response = await fetch("/api/parametres/logo", { method: "DELETE" });
    if (!response.ok) {
      toast((await response.json()).error ?? "Suppression impossible", "error");
      return;
    }
    setLogo(false);
    toast("Logo supprimé", "info");
  };

  return (
    <form onSubmit={save} className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="flex flex-col gap-4 xl:col-span-2">
        <Card>
          <CardHeader title="Votre société" hint="Ces informations figurent sur chaque facture" />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-6 md:p-5">
            <Field label="Raison sociale" className="sm:col-span-4">
              <input {...text("companyName")} required />
            </Field>
            <Field label="Forme juridique" className="sm:col-span-2">
              <input {...text("legalForm", "SAS, SARL, EI…")} />
            </Field>
            <Field label="Adresse" className="sm:col-span-6">
              <input {...text("address")} />
            </Field>
            <Field label="Code postal" className="sm:col-span-2">
              <input {...text("postalCode")} />
            </Field>
            <Field label="Ville" className="sm:col-span-2">
              <input {...text("city")} />
            </Field>
            <Field label="Pays" className="sm:col-span-2">
              <input {...text("country")} />
            </Field>
            <Field label="SIRET" className="sm:col-span-3">
              <input {...text("siret", "123 456 789 00012")} />
            </Field>
            <Field label="N° TVA intracommunautaire" className="sm:col-span-3">
              <input {...text("vatNumber", "FR00 123456789")} />
            </Field>
            <Field label="RCS" className="sm:col-span-3">
              <input {...text("rcs", "Paris 123 456 789")} />
            </Field>
            <Field label="Capital social" className="sm:col-span-3">
              <input {...text("capital", "10 000 €")} />
            </Field>
            <Field label="E-mail" className="sm:col-span-2">
              <input {...text("email")} type="email" />
            </Field>
            <Field label="Téléphone" className="sm:col-span-2">
              <input {...text("phone")} />
            </Field>
            <Field label="Site web" className="sm:col-span-2">
              <input {...text("website")} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Contenu des factures" hint="Libellé de la prestation, TVA et mentions" />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-6 md:p-5">
            <Field label="Désignation" className="sm:col-span-4" hint="Intitulé de la ligne facturée">
              <input {...text("designation")} />
            </Field>
            <Field label="Préfixe de numérotation" className="sm:col-span-2" hint="S'applique aux nouvelles factures">
              <input {...text("invoicePrefix")} />
            </Field>
            <Field label="Description (facultatif)" className="sm:col-span-6">
              <textarea {...text("description")} rows={2} />
            </Field>
            <Field label="Taux de TVA (%)" className="sm:col-span-2" hint="0 = franchise en base (art. 293 B)">
              <input
                className={inputClass}
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={values.vatRate}
                onChange={(e) => setValues((v) => ({ ...v, vatRate: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Mode de paiement" className="sm:col-span-2">
              <input {...text("paymentMethod")} />
            </Field>
            <Field label="Couleur des factures" className="sm:col-span-2">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={values.accentColor}
                  onChange={(e) => setValues((v) => ({ ...v, accentColor: e.target.value }))}
                  className="h-[38px] w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                />
                <input {...text("accentColor")} />
              </div>
            </Field>
            <Field label="Mention en bas de facture (facultatif)" className="sm:col-span-6">
              <textarea {...text("footerNote")} rows={2} />
            </Field>
            <div className="flex flex-col gap-3 sm:col-span-6">
              <Toggle
                checked={values.amountsIncludeVat}
                onChange={(v) => setValues((s) => ({ ...s, amountsIncludeVat: v }))}
                label="Les montants des fichiers sont TTC"
                hint="Le HT et la TVA sont alors calculés à partir du montant du fichier."
              />
              <Toggle
                checked={values.amountsInCents}
                onChange={(v) => setValues((s) => ({ ...s, amountsInCents: v }))}
                label="Les montants des fichiers sont en centimes"
                hint="150000 dans le fichier correspond à 1 500,00 €."
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Logo" hint="PNG ou JPEG, 2 Mo maximum" />
          <div className="p-5">
            <div className="grid h-28 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/parametres/logo?v=${logoStamp}`} alt="Logo de la société" className="max-h-20 max-w-[80%] object-contain" />
              ) : (
                <span className="text-sm text-slate-400">Aucun logo</span>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => fileInput.current?.click()} className={buttonSecondary}>
                <ImagePlus size={16} /> {logo ? "Remplacer" : "Ajouter un logo"}
              </button>
              {logo ? (
                <button type="button" onClick={deleteLogo} className={buttonSecondary} title="Supprimer le logo">
                  <Trash2 size={16} />
                </button>
              ) : null}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => uploadLogo(e.target.files?.[0])}
            />
          </div>
        </Card>

        <Card className="p-5">
          <button type="submit" disabled={saving} className={`${buttonPrimary} w-full justify-center`}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Enregistrer
          </button>
          {sampleId ? (
            <a href={`/api/factures/${sampleId}/pdf`} target="_blank" className={`${buttonSecondary} mt-2 w-full justify-center`}>
              Aperçu d&apos;une facture
            </a>
          ) : null}
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            À l&apos;enregistrement, tous les PDF du dossier <code className="rounded bg-slate-100 px-1">factures/</code> sont
            régénérés avec les nouvelles informations. Les numéros déjà attribués ne changent pas.
          </p>
        </Card>
      </div>
    </form>
  );
}
