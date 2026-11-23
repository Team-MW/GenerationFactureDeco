import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { computeTotals, dateFr, dateLong } from "./format";
import type { Invoice, Settings } from "./types";

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const SOFT = "#f8fafc";

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 90, paddingHorizontal: 44, fontFamily: "Helvetica", fontSize: 9.5, color: INK },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { height: 66, maxWidth: 180, objectFit: "contain", objectPosition: "left" },
  company: { fontFamily: "Helvetica-Bold", fontSize: 18 },
  companySub: { color: MUTED, marginTop: 3 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 24, letterSpacing: 2, textAlign: "right" },
  number: { fontFamily: "Helvetica-Bold", fontSize: 11, textAlign: "right", marginTop: 4 },
  paid: {
    alignSelf: "flex-end", marginTop: 8, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 3,
    fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 1, color: "#047857", backgroundColor: "#d1fae5",
  },
  rule: { height: 2, marginTop: 22, marginBottom: 22 },
  parties: { flexDirection: "row", gap: 24 },
  party: { flex: 1 },
  partyBox: { flex: 1, backgroundColor: SOFT, borderRadius: 6, padding: 14 },
  label: { fontFamily: "Helvetica-Bold", fontSize: 7.5, letterSpacing: 1.2, color: MUTED, marginBottom: 6 },
  strong: { fontFamily: "Helvetica-Bold", fontSize: 11.5, marginBottom: 3 },
  line: { color: "#334155", marginBottom: 3.5 },
  meta: { flexDirection: "row", marginTop: 22, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  metaCell: { flex: 1, paddingVertical: 9, paddingHorizontal: 12, borderRightWidth: 1, borderRightColor: LINE },
  metaValue: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  thead: { flexDirection: "row", marginTop: 24, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 4 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 0.8, color: "#ffffff" },
  row: { flexDirection: "row", paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: LINE },
  cDesc: { flex: 1, paddingRight: 10 },
  cQty: { width: 36, textAlign: "right" },
  cPrice: { width: 84, textAlign: "right" },
  cVat: { width: 48, textAlign: "right" },
  cTotal: { width: 88, textAlign: "right" },
  desc: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  descSub: { color: MUTED, marginTop: 4 },
  bottom: { flexDirection: "row", marginTop: 20, gap: 24 },
  notes: { flex: 1 },
  totals: { width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, paddingHorizontal: 12 },
  totalLabel: { color: MUTED },
  grand: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 4,
  },
  grandText: { fontFamily: "Helvetica-Bold", fontSize: 12, color: "#ffffff" },
  footer: { position: "absolute", left: 44, right: 44, bottom: 30, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 10 },
  footerText: { fontSize: 7.5, color: MUTED, textAlign: "center", marginBottom: 3 },
});

const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
// La police Helvetica intégrée ne connaît pas les espaces fines insécables.
const money = (n: number) => eurFmt.format(n).replace(/[  ]/g, " ");

function InvoiceDocument({ invoice, settings, logo }: { invoice: Invoice; settings: Settings; logo: string | null }) {
  const accent = settings.accentColor;
  const { ht, vat, ttc } = computeTotals(invoice.amount, settings);
  const vatLabel = settings.vatRate > 0 ? `${String(settings.vatRate).replace(".", ",")} %` : "—";
  const cityLine = [settings.postalCode, settings.city].filter(Boolean).join(" ");
  const legal = [
    [settings.companyName, settings.legalForm].filter(Boolean).join(" "),
    settings.capital && `Capital social : ${settings.capital}`,
    settings.siret && `SIRET : ${settings.siret}`,
    settings.rcs && `RCS ${settings.rcs}`,
    settings.vatNumber && `TVA : ${settings.vatNumber}`,
  ].filter(Boolean);
  const contact = [settings.address, cityLine, settings.email, settings.phone, settings.website].filter(Boolean);

  return (
    <Document
      title={`Facture ${invoice.number}`}
      author={settings.companyName}
      subject={`Facture ${invoice.number} – ${invoice.client}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {logo ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logo} style={styles.logo} />
            ) : (
              <Text style={[styles.company, { color: accent }]}>{settings.companyName}</Text>
            )}
            {settings.legalForm ? (
              <Text style={styles.companySub}>
                {logo ? `${settings.companyName} · ${settings.legalForm}` : settings.legalForm}
              </Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.title}>FACTURE</Text>
            <Text style={[styles.number, { color: accent }]}>N° {invoice.number}</Text>
            <Text style={styles.paid}>ACQUITTÉE</Text>
          </View>
        </View>

        <View style={[styles.rule, { backgroundColor: accent }]} />

        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.label}>ÉMETTEUR</Text>
            <Text style={styles.strong}>{settings.companyName}</Text>
            {settings.address ? <Text style={styles.line}>{settings.address}</Text> : null}
            {cityLine ? <Text style={styles.line}>{cityLine}</Text> : null}
            {settings.country ? <Text style={styles.line}>{settings.country}</Text> : null}
            {settings.siret ? <Text style={styles.line}>SIRET : {settings.siret}</Text> : null}
            {settings.vatNumber ? <Text style={styles.line}>N° TVA : {settings.vatNumber}</Text> : null}
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.label}>FACTURÉ À</Text>
            <Text style={styles.strong}>{invoice.client}</Text>
            <Text style={styles.line}>Référence dossier : {invoice.ref}</Text>
          </View>
        </View>

        <View style={styles.meta}>
          <View style={styles.metaCell}>
            <Text style={styles.label}>DATE D&apos;ÉMISSION</Text>
            <Text style={styles.metaValue}>{dateFr(invoice.date)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.label}>DATE DE PAIEMENT</Text>
            <Text style={styles.metaValue}>{dateFr(invoice.date)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.label}>MODE DE PAIEMENT</Text>
            <Text style={styles.metaValue}>{settings.paymentMethod || "—"}</Text>
          </View>
          <View style={[styles.metaCell, { borderRightWidth: 0 }]}>
            <Text style={styles.label}>RÉFÉRENCE</Text>
            <Text style={[styles.metaValue, { fontSize: 8.5 }]}>{invoice.ref}</Text>
          </View>
        </View>

        <View style={[styles.thead, { backgroundColor: accent }]}>
          <Text style={[styles.th, styles.cDesc]}>DÉSIGNATION</Text>
          <Text style={[styles.th, styles.cQty]}>QTÉ</Text>
          <Text style={[styles.th, styles.cPrice]}>PRIX UNIT. HT</Text>
          <Text style={[styles.th, styles.cVat]}>TVA</Text>
          <Text style={[styles.th, styles.cTotal]}>TOTAL HT</Text>
        </View>
        <View style={styles.row}>
          <View style={styles.cDesc}>
            <Text style={styles.desc}>{settings.designation || "Prestation"}</Text>
            {settings.description ? <Text style={styles.descSub}>{settings.description}</Text> : null}
          </View>
          <Text style={styles.cQty}>1</Text>
          <Text style={styles.cPrice}>{money(ht)}</Text>
          <Text style={styles.cVat}>{vatLabel}</Text>
          <Text style={[styles.cTotal, { fontFamily: "Helvetica-Bold" }]}>{money(ht)}</Text>
        </View>

        <View style={styles.bottom}>
          <View style={styles.notes}>
            <Text style={styles.label}>RÈGLEMENT</Text>
            <Text style={styles.line}>
              Facture acquittée le {dateLong(invoice.date)}
              {settings.paymentMethod ? ` par ${settings.paymentMethod.toLowerCase()}` : ""}.
            </Text>
            <Text style={styles.line}>Aucun montant ne reste dû.</Text>
            {settings.vatRate === 0 ? (
              <Text style={[styles.line, { marginTop: 8 }]}>TVA non applicable, art. 293 B du CGI.</Text>
            ) : null}
            {settings.footerNote ? <Text style={[styles.line, { marginTop: 8 }]}>{settings.footerNote}</Text> : null}
          </View>
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total HT</Text>
              <Text>{money(ht)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TVA{settings.vatRate > 0 ? ` (${vatLabel})` : ""}</Text>
              <Text>{money(vat)}</Text>
            </View>
            <View style={[styles.grand, { backgroundColor: accent }]}>
              <Text style={styles.grandText}>Total TTC</Text>
              <Text style={styles.grandText}>{money(ttc)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Déjà réglé</Text>
              <Text>{money(ttc)}</Text>
            </View>
            <View style={[styles.totalRow, { paddingTop: 0 }]}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Reste à payer</Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{money(0)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{legal.join("  ·  ")}</Text>
          {contact.length ? <Text style={styles.footerText}>{contact.join("  ·  ")}</Text> : null}
        </View>
      </Page>
    </Document>
  );
}

export function renderInvoicePdf(invoice: Invoice, settings: Settings, logo: string | null): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument invoice={invoice} settings={settings} logo={logo} />);
}
