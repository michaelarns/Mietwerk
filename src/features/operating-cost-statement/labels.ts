import {
  type AdvanceBasis,
  type StatementStatus,
} from "../../../generated/prisma";

// Umlageschlüssel- und Kategorie-Labels werden aus dem Phase-3-Slice
// wiederverwendet (eine Quelle der Wahrheit).
export { ALLOCATION_KEY_LABELS, CATEGORY_LABELS } from "../costs-accounting/labels";

export const STATEMENT_STATUS_LABELS: Record<StatementStatus, string> = {
  DRAFT: "Entwurf",
  FINALIZED: "Finalisiert",
  SENT: "Versendet",
};

export const ADVANCE_BASIS_LABELS: Record<AdvanceBasis, string> = {
  SOLL: "Vereinbart (Soll)",
  IST: "Tatsächlich gezahlt (Ist)",
};

/** Ergebnis-Etikett für einen Saldo (Cent): Nachzahlung / Guthaben / ausgeglichen. */
export function balanceLabel(balanceCents: number): string {
  if (balanceCents > 0) return "Nachzahlung";
  if (balanceCents < 0) return "Guthaben";
  return "ausgeglichen";
}
