/**
 * Wiederverwendbares PDF-Basis-Layout (ADR 0010). Stellt ein A4-Grundgerüst,
 * Kopf-/Fußzeile und gemeinsame Styles bereit, die alle Mietwerk-PDFs nutzen
 * (Betriebskostenabrechnung jetzt; Mahnung/Anlage V später). Nutzt die in
 * `@react-pdf/renderer` eingebauten Schriften (Helvetica) — keine Font-
 * Registrierung, damit das Layout deterministisch und abhängigkeitsarm bleibt.
 */
import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { type ReactNode } from "react";

const COLORS = {
  ink: "#111827",
  muted: "#6b7280",
  line: "#d1d5db",
  bandBg: "#f3f4f6",
  accent: "#1f2937",
};

export const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: COLORS.ink,
    lineHeight: 1.4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  brand: { fontSize: 14, fontFamily: "Helvetica-Bold", color: COLORS.accent },
  headerMeta: { fontSize: 9, color: COLORS.muted, textAlign: "right" },
  rule: { borderBottomWidth: 1, borderBottomColor: COLORS.line, marginTop: 6, marginBottom: 14 },

  h1: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  subtle: { color: COLORS.muted },
  bold: { fontFamily: "Helvetica-Bold" },

  // Zwei-Spalten-Adressblock
  twoCol: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  col: { width: "48%" },

  // Tabelle
  table: { marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingVertical: 4 },
  trHead: { backgroundColor: COLORS.bandBg, borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingVertical: 5 },
  trTotal: { flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.accent, paddingVertical: 5, marginTop: 2 },
  cell: { paddingHorizontal: 4 },
  right: { textAlign: "right" },

  resultBox: {
    marginTop: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 3,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  resultLabel: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  resultValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },

  note: { fontSize: 8, color: COLORS.muted, marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 8,
    color: COLORS.muted,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: 6,
  },
});

export function PdfHeader(props: { brand: string; metaLines: string[] }) {
  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.brand}>{props.brand}</Text>
        <View style={styles.headerMeta}>
          {props.metaLines.map((l, i) => (
            <Text key={i}>{l}</Text>
          ))}
        </View>
      </View>
      <View style={styles.rule} />
    </View>
  );
}

export function PdfFooter(props: { note: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{props.note}</Text>
      <Text
        render={({ pageNumber, totalPages }) => `Seite ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

/** Standard-A4-Seite mit Kopf-/Fußzeile. */
export function PdfPage(props: {
  brand: string;
  metaLines: string[];
  footerNote: string;
  children: ReactNode;
}) {
  return (
    <Page size="A4" style={styles.page}>
      <PdfHeader brand={props.brand} metaLines={props.metaLines} />
      {props.children}
      <PdfFooter note={props.footerNote} />
    </Page>
  );
}
