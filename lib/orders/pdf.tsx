import { Document, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { dateFr } from "../format";
import type { Settings } from "../types";
import { CGV, TAGLINE } from "./cgv";
import { DELIVERY_MODES, SHOPS, fullAddress, orderBalance, orderTotals, parisDate, signatureMatches } from "./logic";
import type { Order } from "./types";

/**
 * Bon de commande au format du carnet papier du magasin :
 * recto = commande (en-tête, magasins, client, tableau, observations, totaux), verso = CGV.
 */
const RED = "#c62828";
const INK = "#111827";
const TABLE_HEIGHT = 380;

const s = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 78, paddingHorizontal: 32, fontFamily: "Helvetica", fontSize: 10, color: INK },
  top: { flexDirection: "row", gap: 18 },
  left: { flex: 1.25 },
  right: { flex: 1 },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 38, letterSpacing: -0.5, lineHeight: 1 },
  tagline: { fontFamily: "Helvetica-Bold", fontSize: 11.5, letterSpacing: 0.6, marginTop: 2 },
  docTitle: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 10, marginBottom: 8 },
  docName: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  docNumber: { fontFamily: "Helvetica-Bold", fontSize: 13, color: RED, letterSpacing: 1 },
  shop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 7, paddingHorizontal: 10, marginBottom: 2 },
  shopText: { color: "#ffffff", fontSize: 9.5, marginBottom: 2 },
  date: { flexDirection: "row", justifyContent: "flex-end", gap: 6, marginBottom: 8 },
  dateLabel: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  clientTitle: { fontFamily: "Helvetica-Bold", fontSize: 13, textAlign: "center", marginBottom: 4 },
  clientBox: { borderWidth: 1.2, padding: 9, flexGrow: 1 },
  clientRow: { flexDirection: "row", marginBottom: 5 },
  clientLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, width: 72 },
  clientValue: { flex: 1, fontSize: 10 },
  thead: { flexDirection: "row", marginTop: 12, paddingVertical: 7 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#ffffff", textAlign: "center", letterSpacing: 0.6 },
  body: { borderWidth: 1.2, borderTopWidth: 0, minHeight: TABLE_HEIGHT, position: "relative" },
  row: { flexDirection: "row", paddingVertical: 8 },
  cQty: { width: 72, textAlign: "center" },
  cDesc: { flex: 1, paddingHorizontal: 10 },
  cUnit: { width: 86, textAlign: "right", paddingRight: 8 },
  cTotal: { width: 96, textAlign: "right", paddingRight: 8 },
  rule: { position: "absolute", top: 0, bottom: 0, width: 1.2 },
  bold: { fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 8.5, color: "#4b5563", marginTop: 2 },
  bottom: { flexDirection: "row", gap: 14, marginTop: 10 },
  obs: { flex: 1, borderWidth: 1.2, padding: 8, minHeight: 78 },
  obsTitle: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 5 },
  totals: { width: 250, borderWidth: 1.2 },
  totalRow: { flexDirection: "row", alignItems: "center", minHeight: 26 },
  totalLabel: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 9, textAlign: "right", paddingRight: 10 },
  totalValue: { width: 96, textAlign: "right", paddingRight: 8, fontFamily: "Helvetica-Bold", fontSize: 11, borderLeftWidth: 1.2, alignSelf: "stretch", paddingTop: 7 },
  stamp: { position: "absolute", left: 190, bottom: 34, borderWidth: 2.5, borderColor: RED, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 14, transform: "rotate(-8deg)", opacity: 0.85 },
  stampText: { fontFamily: "Helvetica-Bold", fontSize: 24, color: RED, letterSpacing: 2 },
  footer: { position: "absolute", left: 32, right: 32, bottom: 26, paddingVertical: 7, paddingHorizontal: 8 },
  footerText: { color: "#ffffff", textAlign: "center", fontSize: 9, marginBottom: 2 },
  cgvBrand: { fontFamily: "Helvetica-Bold", fontSize: 30, textAlign: "center", lineHeight: 1 },
  cgvCenter: { textAlign: "center", fontSize: 8.5, marginBottom: 2.5 },
  cgvTitle: { fontFamily: "Helvetica-Bold", fontSize: 9.5, textAlign: "center", marginTop: 13, marginBottom: 4 },
  cgvLine: { textAlign: "center", fontSize: 8.5, marginBottom: 3, lineHeight: 1.35 },
  sign: { marginTop: 26, alignSelf: "flex-end", width: 210, height: 104, borderWidth: 1.2, padding: 8 },
});

const fmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const money = (n: number) => fmt.format(n).replace(/[  ]/g, " ");

function Footer({ settings, accent }: { settings: Settings; accent: string }) {
  const contact = [settings.phone, settings.email.toUpperCase()].filter(Boolean);
  const legal = [
    settings.rcs && `IMMATRICULATION AU RCS, NUMÉRO ${settings.rcs.replace(/^\D+/, "")} R.C.S. ${settings.rcs.split(" ")[0].toUpperCase()}`,
    settings.vatNumber && `NOTRE TVA ${settings.vatNumber}`,
  ].filter(Boolean);
  return (
    <View style={[s.footer, { backgroundColor: accent }]} fixed>
      {contact.map((line) => (
        <Text key={line} style={s.footerText}>
          {line}
        </Text>
      ))}
      {legal.length ? <Text style={[s.footerText, { fontSize: 8, marginBottom: 0 }]}>{legal.join("     ")}</Text> : null}
    </View>
  );
}

const signedAt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(" ", " à ");

function OrderDocument({ order, settings }: { order: Order; settings: Settings }) {
  const accent = settings.accentColor;
  const blue = { color: accent };
  const border = { borderColor: accent };
  const totals = orderTotals(order);
  const balance = orderBalance(order);
  const mode = DELIVERY_MODES[order.delivery.mode];
  const pickup = order.delivery.mode === "retrait";
  const brand = settings.companyName.toUpperCase();
  const address = fullAddress(order);
  // La signature n'apparaît que sur le bon que le client a réellement signé.
  const signature = order.signature && signatureMatches(order) ? order.signature : null;

  return (
    <Document title={`Bon de commande ${order.number}`} author={settings.companyName}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <View style={s.left}>
            <Text style={[s.brand, blue]}>{brand}</Text>
            <Text style={[s.tagline, blue]}>{TAGLINE}</Text>
            <View style={s.docTitle}>
              <Text style={[s.docName, blue]}>BON DE COMMANDE</Text>
              <Text style={s.docNumber}>N° {order.number}</Text>
            </View>
            {/* Un seul magasin aujourd'hui ; une ancienne commande garde l'adresse du magasin qui l'a prise. */}
            <View style={[s.shop, { backgroundColor: accent }]}>
              <View>
                <Text style={s.shopText}>{SHOPS[order.shop].label}</Text>
                <Text style={[s.shopText, { marginBottom: 0 }]}>{SHOPS[order.shop].address}</Text>
              </View>
            </View>
          </View>

          <View style={s.right}>
            <View style={s.date}>
              <Text style={[s.dateLabel, blue]}>DATE :</Text>
              <Text style={{ fontSize: 12 }}>{dateFr(parisDate(order.createdAt))}</Text>
            </View>
            <Text style={[s.clientTitle, blue]}>CLIENT</Text>
            <View style={[s.clientBox, border]}>
              {(
                [
                  ["NOM", order.customer.name],
                  ["NUM PHONE", order.customer.phone],
                  ["ADRESSE", address],
                  ["EMAIL", order.customer.email],
                ] as const
              ).map(([label, value]) => (
                <View key={label} style={s.clientRow}>
                  <Text style={[s.clientLabel, blue]}>{label}</Text>
                  <Text style={s.clientValue}>{value || " "}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={[s.thead, { backgroundColor: accent }]}>
          <Text style={[s.th, { width: 72 }]}>QUANTITÉ</Text>
          <Text style={[s.th, { flex: 1 }]}>DÉSIGNATION</Text>
          <Text style={[s.th, { width: 86 }]}>PRIX UNIT</Text>
          <Text style={[s.th, { width: 96 }]}>TOTAL</Text>
        </View>
        <View style={[s.body, border]}>
          {/* Filets verticaux sur toute la hauteur, comme sur le carnet */}
          <View style={[s.rule, { left: 72, backgroundColor: accent }]} />
          <View style={[s.rule, { right: 182, backgroundColor: accent }]} />
          <View style={[s.rule, { right: 96, backgroundColor: accent }]} />

          {order.lines.map((line) => (
            <View key={line.id} style={s.row} wrap={false}>
              <Text style={[s.cQty, s.bold]}>{line.quantity}</Text>
              <View style={s.cDesc}>
                <Text style={s.bold}>{line.name}</Text>
                {line.reference ? <Text style={s.sub}>Réf. {line.reference}</Text> : null}
              </View>
              <Text style={s.cUnit}>{money(line.unitPrice)}</Text>
              <Text style={[s.cTotal, s.bold]}>{money(line.unitPrice * line.quantity)}</Text>
            </View>
          ))}

          {totals.discount > 0 ? (
            <View style={s.row} wrap={false}>
              <Text style={s.cQty}> </Text>
              <View style={s.cDesc}>
                <Text style={s.bold}>
                  Réduction{order.discount.type === "percent" ? ` ${String(order.discount.value).replace(".", ",")} %` : ""}
                </Text>
              </View>
              <Text style={s.cUnit}> </Text>
              <Text style={[s.cTotal, s.bold]}>- {money(totals.discount)}</Text>
            </View>
          ) : null}

          <View style={s.row} wrap={false}>
            <Text style={[s.cQty, s.bold]}>1</Text>
            <View style={s.cDesc}>
              <Text style={s.bold}>{mode.label}</Text>
              {order.delivery.offered ? <Text style={[s.sub, s.bold]}>Offerte</Text> : null}
              {!order.delivery.offered && order.delivery.adjustment > 0 ? <Text style={s.sub}>Dont supplément distance {money(order.delivery.adjustment)}</Text> : null}
              {!order.delivery.offered && order.delivery.adjustment < 0 ? <Text style={s.sub}>Dont remise {money(-order.delivery.adjustment)}</Text> : null}
              {order.customer.notes ? <Text style={s.sub}>{order.customer.notes}</Text> : null}
            </View>
            <Text style={s.cUnit}>{pickup ? " " : order.delivery.offered ? "Offerte" : money(totals.delivery)}</Text>
            <Text style={[s.cTotal, s.bold]}>{pickup ? " " : order.delivery.offered ? "Offerte" : money(totals.delivery)}</Text>
          </View>

          {order.extras.map((extra) => (
            <View key={extra.id} style={s.row} wrap={false}>
              <Text style={[s.cQty, s.bold]}>1</Text>
              <View style={s.cDesc}>
                <Text style={s.bold}>{extra.label}</Text>
                <Text style={s.sub}>Prestation ajoutée</Text>
              </View>
              <Text style={s.cUnit}>{money(extra.amount)}</Text>
              <Text style={[s.cTotal, s.bold]}>{money(extra.amount)}</Text>
            </View>
          ))}

          {balance.settled ? (
            <View style={s.stamp}>
              <Text style={s.stampText}>PAYÉ</Text>
            </View>
          ) : null}
        </View>

        <View style={s.bottom} wrap={false}>
          <View style={[s.obs, border]}>
            <Text style={[s.obsTitle, blue]}>OBSERVATIONS ET DÉLAIS :</Text>
            <Text>{order.observations || " "}</Text>
          </View>
          <View style={[s.totals, border]}>
            {(
              [
                ["TOTAL TTC", money(balance.total)],
                ["ACOMPTE", balance.paid > 0 ? money(balance.paid) : " "],
                ["RESTE À PAYER", money(balance.rest)],
              ] as const
            ).map(([label, value], index) => (
              <View key={label} style={[s.totalRow, index ? { borderTopWidth: 1.2, borderTopColor: accent } : {}]}>
                <Text style={[s.totalLabel, blue]}>{label}</Text>
                <Text style={[s.totalValue, { borderLeftColor: accent }]}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        <Footer settings={settings} accent={accent} />
      </Page>

      <Page size="A4" style={[s.page, { paddingTop: 36 }]}>
        <Text style={[s.cgvBrand, blue]}>{brand}</Text>
        <Text style={[s.tagline, blue, { textAlign: "center", marginBottom: 10 }]}>{TAGLINE}</Text>
        <Text style={[s.cgvCenter, s.bold, blue]}>CONDITIONS GÉNÉRALES DE VENTE (CGV) – SAS {brand}</Text>
        <Text style={[s.cgvCenter, blue]}>ADRESSE : {SHOPS.toulouse.address}</Text>
        {settings.email ? <Text style={[s.cgvCenter, blue]}>E-MAIL : {settings.email.toUpperCase()}</Text> : null}
        {settings.phone ? <Text style={[s.cgvCenter, blue]}>TÉLÉPHONE : {settings.phone}</Text> : null}
        {settings.vatNumber ? <Text style={[s.cgvCenter, blue]}>NUMÉRO DE TVA : {settings.vatNumber}</Text> : null}

        {CGV.map((section) => (
          <View key={section.title} wrap={false}>
            <Text style={[s.cgvTitle, blue]}>{section.title}</Text>
            {section.lines.map((line) => (
              <Text key={line} style={[s.cgvLine, blue]}>
                {line.toUpperCase()}
              </Text>
            ))}
          </View>
        ))}

        <View style={[s.sign, border]} wrap={false}>
          <Text style={[s.bold, blue, { fontSize: 9 }]}>BON POUR ACCORD</Text>
          <Text style={[s.bold, blue, { fontSize: 9 }]}>SIGNATURE CLIENT</Text>
          {signature ? (
            <>
              <Svg viewBox="0 0 600 200" style={{ width: 165, height: 55, alignSelf: "center" }}>
                <Path d={signature.path} stroke="#0f172a" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </Svg>
              <Text style={{ fontSize: 6.5, color: "#334155", textAlign: "center" }}>
                Signé électroniquement par {order.customer.name} le {signedAt(signature.at)}
              </Text>
            </>
          ) : null}
        </View>

        <Footer settings={settings} accent={accent} />
      </Page>
    </Document>
  );
}

export function renderDeliveryNote(order: Order, settings: Settings): Promise<Buffer> {
  return renderToBuffer(<OrderDocument order={order} settings={settings} />);
}
