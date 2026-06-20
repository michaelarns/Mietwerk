import "server-only";

import {
  Prisma,
  type PrismaClient,
  type DunningLevel,
} from "../../../generated/prisma";
import { writeAuditLog } from "~/server/audit";
import { sendMail } from "~/server/mail";
import { openAmount } from "./allocation-rules";
import { daysOverdue } from "./charge-rules";
import {
  computeInterestCents,
  nextDunningLevel,
  renderDunningLetter,
  type DunningConfig,
} from "./dunning-rules";
import { formatPeriod } from "./labels";
import { type UpdateDunningPolicyInput } from "./rent-payments.schema";

/**
 * Default dunning configuration — business conventions, all configurable per org.
 * Decisions for Phase 2: 3 stages (REMINDER → FIRST → SECOND), interest and
 * fees OFF by default (see dunning-rules.ts header for the legal reasoning).
 * `baseRatePercent` defaults to 0 and MUST be set to the current Basiszinssatz
 * (§ 247 BGB) before interest is enabled — we do not hard-code a legal rate.
 */
const DEFAULT_TOLERANCE_DAYS = 3;
const DEFAULT_INTEREST_MARGIN = 5; // Prozentpunkte, § 288 Abs. 1 BGB (Verbraucher)
const DEFAULT_LEVELS: Array<{
  level: DunningLevel;
  minDaysOverdue: number;
  feeCents: number;
}> = [
  { level: "REMINDER", minDaysOverdue: 7, feeCents: 0 },
  { level: "FIRST", minDaysOverdue: 14, feeCents: 0 },
  { level: "SECOND", minDaysOverdue: 30, feeCents: 0 },
];

function defaultConfig(): DunningConfig {
  return {
    toleranceDays: DEFAULT_TOLERANCE_DAYS,
    levels: DEFAULT_LEVELS,
    interestEnabled: false,
    baseRatePercent: 0,
    interestMarginPercent: DEFAULT_INTEREST_MARGIN,
    feesEnabled: false,
  };
}

type PolicyWithLevels = Prisma.DunningPolicyGetPayload<{
  include: { levels: true };
}>;

function toConfig(policy: PolicyWithLevels): DunningConfig {
  return {
    toleranceDays: policy.toleranceDays,
    levels: policy.levels.map((l) => ({
      level: l.level,
      minDaysOverdue: l.minDaysOverdue,
      feeCents: l.feeCents,
    })),
    interestEnabled: policy.interestEnabled,
    baseRatePercent: policy.baseRatePercent,
    interestMarginPercent: policy.interestMarginPercent,
    feesEnabled: policy.feesEnabled,
  };
}

/** Read the org's dunning config; falls back to defaults WITHOUT writing. */
export async function resolveDunningConfig(
  db: PrismaClient,
  organizationId: string,
): Promise<DunningConfig> {
  const policy = await db.dunningPolicy.findUnique({
    where: { organizationId },
    include: { levels: true },
  });
  return policy ? toConfig(policy) : defaultConfig();
}

/** Policy row for the settings screen (null when never customised → defaults). */
export function getDunningPolicy(db: PrismaClient, organizationId: string) {
  return db.dunningPolicy.findUnique({
    where: { organizationId },
    include: { levels: { orderBy: { minDaysOverdue: "asc" } } },
  });
}

/** Create or update the org's dunning policy (configurable thresholds/rates). */
export async function upsertDunningPolicy(
  db: PrismaClient,
  organizationId: string,
  input: UpdateDunningPolicyInput,
  opts: { userId?: string | null } = {},
) {
  const result = await db.$transaction(async (tx) => {
    const policy = await tx.dunningPolicy.upsert({
      where: { organizationId },
      create: {
        organizationId,
        toleranceDays: input.toleranceDays,
        interestEnabled: input.interestEnabled,
        baseRatePercent: input.baseRatePercent,
        interestMarginPercent: input.interestMarginPercent,
        feesEnabled: input.feesEnabled,
      },
      update: {
        toleranceDays: input.toleranceDays,
        interestEnabled: input.interestEnabled,
        baseRatePercent: input.baseRatePercent,
        interestMarginPercent: input.interestMarginPercent,
        feesEnabled: input.feesEnabled,
      },
      select: { id: true },
    });
    await tx.dunningPolicyLevel.deleteMany({ where: { policyId: policy.id } });
    await tx.dunningPolicyLevel.createMany({
      data: input.levels.map((l) => ({
        policyId: policy.id,
        level: l.level,
        minDaysOverdue: l.minDaysOverdue,
        feeCents: l.feeCents,
      })),
    });
    return policy;
  });

  await writeAuditLog(db, {
    organizationId,
    userId: opts.userId ?? null,
    action: "dunningPolicy.update",
    entityType: "DunningPolicy",
    entityId: result.id,
  });
  return result;
}

export interface DunningRunResult {
  issued: number;
  candidates: number;
}

/**
 * Advance the dunning state machine for all overdue receivables of an org.
 *
 * - A receivable is a candidate while still owed (OPEN/PARTIAL) and overdue past
 *   the tolerance. A settling payment moves it to PAID → it drops out and the
 *   Mahnlauf is closed automatically.
 * - Escalation is monotone (lowest un-issued level whose threshold is met) and
 *   idempotent: the `@@unique([rentPaymentId, level])` constraint plus the
 *   issued-levels check prevent duplicate dunnings, so the job can run daily and
 *   be triggered manually without side effects.
 */
export async function runDunningForOrg(
  db: PrismaClient,
  organizationId: string,
  now: Date,
  opts: { userId?: string | null } = {},
): Promise<DunningRunResult> {
  const config = await resolveDunningConfig(db, organizationId);

  const candidates = await db.rentPayment.findMany({
    where: {
      organizationId,
      status: { in: ["OPEN", "PARTIAL"] },
      dueDate: { lt: now },
    },
    select: {
      id: true,
      dueDate: true,
      targetCents: true,
      paidCents: true,
      periodYear: true,
      periodMonth: true,
      dunnings: { select: { level: true } },
      lease: {
        select: {
          leaseTenants: {
            select: {
              tenant: { select: { firstName: true, lastName: true, email: true } },
            },
          },
        },
      },
    },
  });

  let issued = 0;
  for (const rp of candidates) {
    const remaining = openAmount(rp);
    if (remaining <= 0) continue;
    const overdue = daysOverdue(rp.dueDate, now);
    if (overdue <= config.toleranceDays) continue;

    const rule = nextDunningLevel({
      daysOverdue: overdue,
      issuedLevels: rp.dunnings.map((d) => d.level),
      config,
    });
    if (!rule) continue;

    const interestCents = computeInterestCents({
      principalCents: remaining,
      config,
      dueDate: rp.dueDate,
      asOf: now,
    });
    const feeCents = config.feesEnabled ? rule.feeCents : 0;

    const tenants = rp.lease.leaseTenants.map((lt) => lt.tenant);
    const names = tenants.map((t) => `${t.firstName} ${t.lastName}`.trim());
    const recipient = tenants.find((t) => t.email)?.email ?? null;
    const letter = renderDunningLetter({
      level: rule.level,
      tenantNames: names,
      periodLabel: formatPeriod(rp.periodYear, rp.periodMonth),
      dueDate: rp.dueDate,
      openCents: remaining,
      feeCents,
      interestCents,
    });

    let dunningId: string;
    try {
      const dunning = await db.dunning.create({
        data: {
          organizationId,
          rentPaymentId: rp.id,
          level: rule.level,
          feeCents,
          interestCents,
          channel: recipient ? "EMAIL" : "TEXT",
          recipient,
          body: letter.body,
          sentAt: now,
        },
        select: { id: true },
      });
      dunningId = dunning.id;
    } catch (e) {
      // Unique (rentPaymentId, level) -> already issued by a concurrent run.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        continue;
      }
      throw e;
    }

    if (recipient) {
      try {
        await sendMail({ to: recipient, subject: letter.subject, text: letter.body });
      } catch {
        // Keep the dunning record even if the local SMTP is unavailable.
      }
    }

    await writeAuditLog(db, {
      organizationId,
      userId: opts.userId ?? null,
      action: "dunning.issue",
      entityType: "Dunning",
      entityId: dunningId,
      metadata: {
        rentPaymentId: rp.id,
        level: rule.level,
        feeCents,
        interestCents,
        daysOverdue: overdue,
      },
    });
    issued++;
  }

  return { issued, candidates: candidates.length };
}
