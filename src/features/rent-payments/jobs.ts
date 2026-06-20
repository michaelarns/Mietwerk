import "server-only";

import { type PrismaClient } from "../../../generated/prisma";
import { generateRentChargesForOrg } from "./charge.service";
import { runDunningForOrg } from "./dunning.service";

/**
 * Recurring background jobs for the money flow (Phase 2). These run in the
 * worker process via pg-boss. They iterate ALL organizations but process each
 * one strictly isolated through the org-scoped service functions — so the jobs
 * never leak data across tenants. Both are idempotent (see the services).
 */
export const RENT_CHARGE_QUEUE = "rent-charge";
export const DUNNING_QUEUE = "dunning-run";

/** Year/month in Europe/Berlin for a given instant. */
export function berlinPeriod(now: Date): {
  periodYear: number;
  periodMonth: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { periodYear: year, periodMonth: month };
}

async function listOrganizationIds(db: PrismaClient): Promise<string[]> {
  const orgs = await db.organization.findMany({ select: { id: true } });
  return orgs.map((o) => o.id);
}

export interface RentChargeJobResult {
  organizations: number;
  periodYear: number;
  periodMonth: number;
  created: number;
}

/** Monthly Sollstellung for the current Berlin month across all orgs. */
export async function runRentChargeJob(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<RentChargeJobResult> {
  const { periodYear, periodMonth } = berlinPeriod(now);
  const orgIds = await listOrganizationIds(db);
  let created = 0;
  for (const organizationId of orgIds) {
    const res = await generateRentChargesForOrg(db, organizationId, {
      periodYear,
      periodMonth,
    });
    created += res.created;
  }
  return { organizations: orgIds.length, periodYear, periodMonth, created };
}

export interface DunningJobResult {
  organizations: number;
  issued: number;
}

/** Daily dunning run across all orgs. */
export async function runDunningJob(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<DunningJobResult> {
  const orgIds = await listOrganizationIds(db);
  let issued = 0;
  for (const organizationId of orgIds) {
    const res = await runDunningForOrg(db, organizationId, now);
    issued += res.issued;
  }
  return { organizations: orgIds.length, issued };
}
