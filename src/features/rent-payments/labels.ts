import {
  type DunningLevel,
  type PaymentMethod,
  type RentPaymentStatus,
} from "../../../generated/prisma";

export const RENT_PAYMENT_STATUS_LABELS: Record<RentPaymentStatus, string> = {
  OPEN: "Offen",
  PARTIAL: "Teilbezahlt",
  PAID: "Bezahlt",
  OVERDUE: "Überfällig",
  WAIVED: "Erlassen",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  MANUAL: "Manuell",
  BANK_IMPORT: "Kontoimport",
};

export const DUNNING_LEVEL_LABELS: Record<DunningLevel, string> = {
  REMINDER: "Zahlungserinnerung",
  FIRST: "1. Mahnung",
  SECOND: "2. Mahnung",
  FINAL: "Letzte Mahnung",
};

/** Display status: overdue is derived, so it overrides OPEN/PARTIAL for display. */
export type DisplayStatus = RentPaymentStatus;

export function displayStatus(
  status: RentPaymentStatus,
  overdue: boolean,
): DisplayStatus {
  return overdue && (status === "OPEN" || status === "PARTIAL")
    ? "OVERDUE"
    : status;
}

export const STATUS_VARIANT: Record<
  DisplayStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  PAID: "default",
  PARTIAL: "secondary",
  OPEN: "outline",
  OVERDUE: "destructive",
  WAIVED: "outline",
};

/** German period label, e.g. "Juni 2025". */
export function formatPeriod(year: number, month: number): string {
  return new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(new Date(Date.UTC(year, month - 1, 15)));
}
