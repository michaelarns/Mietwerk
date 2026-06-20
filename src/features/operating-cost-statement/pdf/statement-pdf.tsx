/**
 * Betriebskostenabrechnung je Mieter als PDF (4.4). Erfüllt die formellen
 * Mindestanforderungen (st. Rspr. BGH, § 259 BGB):
 *   (1) Zusammenstellung der Gesamtkosten,
 *   (2) Angabe und Erläuterung der Verteilerschlüssel,
 *   (3) Berechnung des Anteils des Mieters,
 *   (4) Abzug der geleisteten Vorauszahlungen.
 * Plus Hinweis auf die Abrechnungsfrist (§ 556 Abs. 3 BGB).
 */
import { Document, Text, View } from "@react-pdf/renderer";

import { formatCents } from "~/lib/money";
import { PdfPage, styles } from "~/server/pdf/base-layout";

export interface StatementPdfRow {
  label: string;
  totalCents: number;
  schluesselLabel: string;
  basisLabel: string;
  shareCents: number;
}

export interface StatementPdfData {
  orgName: string;
  propertyName: string;
  propertyAddress: string;
  title: string;
  periodLabel: string;
  deadlineLabel: string;
  tenantNames: string;
  unitLabel: string;
  daysActive: number;
  periodDays: number;
  advanceBasisLabel: string;
  rows: StatementPdfRow[];
  allocatedCents: number;
  advanceCents: number;
  balanceCents: number;
  legalNotes: string[];
  draft: boolean;
}

const COLS = { pos: "30%", total: "15%", key: "18%", basis: "21%", share: "16%" };

function balanceWording(balanceCents: number): { label: string; value: string } {
  if (balanceCents > 0)
    return { label: "Nachzahlung", value: formatCents(balanceCents) };
  if (balanceCents < 0)
    return { label: "Guthaben", value: formatCents(-balanceCents) };
  return { label: "Ergebnis", value: formatCents(0) };
}

export function StatementPdf({ data }: { data: StatementPdfData }) {
  const result = balanceWording(data.balanceCents);
  const prorated = data.daysActive < data.periodDays;

  return (
    <Document
      title={`${data.title} – ${data.unitLabel}`}
      author={data.orgName}
      subject="Betriebskostenabrechnung"
    >
      <PdfPage
        brand={data.orgName}
        metaLines={[data.propertyName, data.propertyAddress, data.periodLabel]}
        footerNote={`${data.orgName} · Betriebskostenabrechnung${data.draft ? " (Entwurf)" : ""}`}
      >
        <Text style={styles.h1}>{data.title}</Text>
        <Text style={styles.subtle}>Abrechnungszeitraum: {data.periodLabel}</Text>

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.bold}>Mieter</Text>
            <Text>{data.tenantNames}</Text>
            <Text style={styles.subtle}>Einheit: {data.unitLabel}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.bold}>Objekt</Text>
            <Text>{data.propertyName}</Text>
            <Text style={styles.subtle}>{data.propertyAddress}</Text>
          </View>
        </View>

        {prorated ? (
          <Text style={styles.note}>
            Zeitanteilige Abrechnung: {data.daysActive} von {data.periodDays} Tagen
            des Zeitraums.
          </Text>
        ) : null}

        <Text style={styles.h2}>Kostenzusammenstellung und Verteilung</Text>
        <View style={styles.table}>
          <View style={[styles.trHead, { flexDirection: "row" }]}>
            <Text style={[styles.cell, styles.bold, { width: COLS.pos }]}>Position</Text>
            <Text style={[styles.cell, styles.bold, styles.right, { width: COLS.total }]}>
              Gesamtkosten
            </Text>
            <Text style={[styles.cell, styles.bold, { width: COLS.key }]}>Schlüssel</Text>
            <Text style={[styles.cell, styles.bold, { width: COLS.basis }]}>Ihr Anteil</Text>
            <Text style={[styles.cell, styles.bold, styles.right, { width: COLS.share }]}>
              Betrag
            </Text>
          </View>

          {data.rows.map((r, i) => (
            <View style={styles.tr} key={i} wrap={false}>
              <Text style={[styles.cell, { width: COLS.pos }]}>{r.label}</Text>
              <Text style={[styles.cell, styles.right, { width: COLS.total }]}>
                {formatCents(r.totalCents)}
              </Text>
              <Text style={[styles.cell, { width: COLS.key }]}>{r.schluesselLabel}</Text>
              <Text style={[styles.cell, { width: COLS.basis }]}>{r.basisLabel}</Text>
              <Text style={[styles.cell, styles.right, { width: COLS.share }]}>
                {formatCents(r.shareCents)}
              </Text>
            </View>
          ))}

          <View style={styles.trTotal}>
            <Text style={[styles.cell, styles.bold, { width: COLS.pos }]}>
              Summe Ihrer Kostenanteile
            </Text>
            <Text style={[styles.cell, { width: COLS.total }]} />
            <Text style={[styles.cell, { width: COLS.key }]} />
            <Text style={[styles.cell, { width: COLS.basis }]} />
            <Text style={[styles.cell, styles.bold, styles.right, { width: COLS.share }]}>
              {formatCents(data.allocatedCents)}
            </Text>
          </View>
        </View>

        <Text style={styles.h2}>Abrechnung der Vorauszahlungen</Text>
        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.cell, { width: "70%" }]}>Umgelegte Kosten (Ihr Anteil)</Text>
            <Text style={[styles.cell, styles.right, { width: "30%" }]}>
              {formatCents(data.allocatedCents)}
            </Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.cell, { width: "70%" }]}>
              ./. geleistete Vorauszahlungen ({data.advanceBasisLabel})
            </Text>
            <Text style={[styles.cell, styles.right, { width: "30%" }]}>
              − {formatCents(data.advanceCents)}
            </Text>
          </View>
        </View>

        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>{result.label}</Text>
          <Text style={styles.resultValue}>{result.value}</Text>
        </View>

        <Text style={styles.h2}>Hinweise</Text>
        {data.legalNotes.map((n, i) => (
          <Text key={i} style={styles.note}>
            • {n}
          </Text>
        ))}
        <Text style={[styles.note, styles.bold]}>{data.deadlineLabel}</Text>
      </PdfPage>
    </Document>
  );
}
