/**
 * Pure dunning (Mahnwesen) rules — no Prisma, no IO, fully unit-testable.
 *
 * RECHTLICHE HINWEISE (zur Freigabe markiert, vgl. ADR 0007 / SPEC §8):
 *  - Verzug der Miete tritt mit Fälligkeit kraft kalendermäßiger Bestimmtheit
 *    ein (§ 286 Abs. 2 Nr. 1 i.V.m. § 556b Abs. 1 BGB) — eine Mahnung ist für
 *    den Verzugseintritt NICHT erforderlich. Die Mahnstufen hier sind eine
 *    geschäftliche Eskalations-Konvention, kein gesetzliches Erfordernis.
 *  - Verzugszinsen: für Verbraucher 5 Prozentpunkte über dem Basiszinssatz
 *    (§ 288 Abs. 1 BGB). Der Basiszinssatz ist variabel (§ 247 BGB) und daher
 *    konfigurierbar. Taggenaue Berechnung (actual/365) — ANNAHME, zu prüfen.
 *  - Mahngebühren sind nur als TATSÄCHLICHER Verzugsschaden ansetzbar
 *    (§§ 280, 286 BGB), nicht als frei gewählte Pauschale; die den Verzug erst
 *    begründende erste Mahnung ist regelmäßig nicht erstattungsfähig. Gebühren
 *    sind daher standardmäßig deaktiviert und je Stufe konfigurierbar.
 */
import { DunningLevel } from "../../../generated/prisma";
import { formatCents } from "~/lib/money";
import { formatDate } from "~/lib/date";

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole days between two dates (>= 0). */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((toUtcDay(to) - toUtcDay(from)) / DAY_MS));
}

export interface DunningLevelRule {
  level: DunningLevel;
  /** Days past the due date from which this level may be issued. */
  minDaysOverdue: number;
  /** Fee for this level in Cent (only a real Verzugsschaden — see header). */
  feeCents: number;
}

export interface DunningConfig {
  toleranceDays: number;
  levels: DunningLevelRule[];
  interestEnabled: boolean;
  /** Basiszinssatz in % (§ 247 BGB), variabel. */
  baseRatePercent: number;
  /** Aufschlag in Prozentpunkten (§ 288 Abs. 1 BGB: 5 für Verbraucher). */
  interestMarginPercent: number;
  feesEnabled: boolean;
}

/**
 * The next dunning level to issue for a receivable: the lowest level not yet
 * issued whose `minDaysOverdue` threshold is met. Returns null when nothing is
 * due. This makes escalation **monotone** (one step per qualifying run) and
 * never skips a level.
 */
export function nextDunningLevel(opts: {
  daysOverdue: number;
  issuedLevels: DunningLevel[];
  config: DunningConfig;
}): DunningLevelRule | null {
  const issued = new Set(opts.issuedLevels);
  const ordered = [...opts.config.levels].sort(
    (a, b) => a.minDaysOverdue - b.minDaysOverdue,
  );
  for (const rule of ordered) {
    if (!issued.has(rule.level) && opts.daysOverdue >= rule.minDaysOverdue) {
      return rule;
    }
  }
  return null;
}

/**
 * Verzugszinsen on the overdue principal, taggenau (actual/365), from the due
 * date until `asOf`. Annual rate = baseRatePercent + interestMarginPercent
 * (§ 288 Abs. 1 BGB). Returns 0 when interest is disabled. Snapshot, no
 * compounding.
 */
export function computeInterestCents(opts: {
  principalCents: number;
  config: DunningConfig;
  dueDate: Date;
  asOf: Date;
}): number {
  if (!opts.config.interestEnabled || opts.principalCents <= 0) return 0;
  const annualRate =
    (opts.config.baseRatePercent + opts.config.interestMarginPercent) / 100;
  if (annualRate <= 0) return 0;
  const days = daysBetween(opts.dueDate, opts.asOf);
  return Math.round((opts.principalCents * annualRate * days) / 365);
}

export const DUNNING_LEVEL_LABELS: Record<DunningLevel, string> = {
  REMINDER: "Zahlungserinnerung",
  FIRST: "1. Mahnung",
  SECOND: "2. Mahnung",
  FINAL: "Letzte Mahnung",
};

export interface DunningLetter {
  subject: string;
  body: string;
}

/** Render the dunning letter text (German). Pure — no IO, no PDF (Phase 4). */
export function renderDunningLetter(opts: {
  level: DunningLevel;
  tenantNames: string[];
  periodLabel: string;
  dueDate: Date;
  openCents: number;
  feeCents: number;
  interestCents: number;
}): DunningLetter {
  const title = DUNNING_LEVEL_LABELS[opts.level];
  const totalCents = opts.openCents + opts.feeCents + opts.interestCents;
  const greeting =
    opts.tenantNames.length > 0
      ? `Sehr geehrte/r ${opts.tenantNames.join(", ")},`
      : "Sehr geehrte Damen und Herren,";

  const intro =
    opts.level === DunningLevel.REMINDER
      ? `wir möchten Sie freundlich daran erinnern, dass die Miete für ${opts.periodLabel} noch offen ist.`
      : `trotz Fälligkeit ist die Miete für ${opts.periodLabel} weiterhin offen. Wir fordern Sie auf, den Rückstand auszugleichen.`;

  const lines = [
    `${title} – Miete ${opts.periodLabel}`,
    "",
    greeting,
    "",
    intro,
    "",
    `Offener Mietbetrag: ${formatCents(opts.openCents)} (fällig seit ${formatDate(opts.dueDate)})`,
  ];
  if (opts.interestCents > 0)
    lines.push(`Verzugszinsen: ${formatCents(opts.interestCents)}`);
  if (opts.feeCents > 0)
    lines.push(`Mahngebühr: ${formatCents(opts.feeCents)}`);
  lines.push(
    `Gesamtbetrag: ${formatCents(totalCents)}`,
    "",
    "Bitte begleichen Sie den Betrag zeitnah. Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es als gegenstandslos.",
    "",
    "Mit freundlichen Grüßen",
    "Ihre Hausverwaltung (Mietwerk)",
  );

  return { subject: `${title}: Miete ${opts.periodLabel}`, body: lines.join("\n") };
}
