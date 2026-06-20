import "server-only";

import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";

import { type Prisma, type PrismaClient } from "../../../generated/prisma";
import { writeAuditLog } from "~/server/audit";
import { openAmount } from "./allocation-rules";
import { parseBankCsv } from "./csv-parser";
import { suggestLease, type MatchCandidate } from "./matching";
import { recordPayment } from "./payment.service";

/** Stable dedupe hash over the identifying fields of a bank line. */
function dedupeHash(parts: Array<string | number | null>): string {
  return createHash("sha256")
    .update(parts.map((p) => String(p ?? "")).join("|"))
    .digest("hex");
}

/** Build matching candidates (tenant names + expected amounts) for an org. */
async function loadMatchCandidates(
  db: PrismaClient,
  organizationId: string,
): Promise<MatchCandidate[]> {
  const leases = await db.lease.findMany({
    where: { organizationId, deletedAt: null },
    select: {
      id: true,
      baseRentCents: true,
      operatingCostAdvanceCents: true,
      leaseTenants: {
        select: { tenant: { select: { firstName: true, lastName: true } } },
      },
      rentPayments: {
        where: { status: { in: ["OPEN", "PARTIAL"] } },
        select: { targetCents: true, paidCents: true },
      },
    },
  });

  return leases.map((l) => {
    const monthly = l.baseRentCents + l.operatingCostAdvanceCents;
    const opens = l.rentPayments.map((r) => openAmount(r));
    const expectedCents = Array.from(
      new Set([monthly, ...opens].filter((c) => c > 0)),
    );
    const tenantNames = l.leaseTenants.flatMap((lt) => [
      lt.tenant.firstName,
      lt.tenant.lastName,
    ]);
    return { leaseId: l.id, tenantNames, expectedCents };
  });
}

export interface ImportResult {
  importId: string;
  created: number;
  duplicates: number;
  /** 1-based source lines that could not be parsed. */
  skippedLines: number[];
}

/**
 * Parse and stage a CSV bank statement. Each line becomes a PENDING
 * BankTransaction with a suggested lease. Re-importing the same file is
 * idempotent: rows with a known `dedupeHash` (already imported, or duplicated
 * within the file) are skipped, not double-staged.
 */
export async function importBankStatement(
  db: PrismaClient,
  organizationId: string,
  input: { fileName: string; content: string },
  opts: { userId?: string | null } = {},
): Promise<ImportResult> {
  const parsed = parseBankCsv(input.content);
  const candidates = await loadMatchCandidates(db, organizationId);

  const existing = new Set(
    (
      await db.bankTransaction.findMany({
        where: { organizationId },
        select: { dedupeHash: true },
      })
    ).map((t) => t.dedupeHash),
  );

  const seen = new Set<string>();
  const data: Prisma.BankTransactionCreateManyInput[] = [];
  let duplicates = 0;

  const importRec = await db.bankImport.create({
    data: {
      organizationId,
      fileName: input.fileName,
      format: "CSV",
      rowCount: parsed.rows.length,
      importedById: opts.userId ?? null,
    },
    select: { id: true },
  });

  for (const row of parsed.rows) {
    const hash = dedupeHash([
      row.bookingDate.toISOString(),
      row.amountCents,
      row.reference,
      row.counterparty,
    ]);
    if (existing.has(hash) || seen.has(hash)) {
      duplicates++;
      continue;
    }
    seen.add(hash);
    const suggestion =
      row.amountCents > 0
        ? suggestLease(
            {
              amountCents: row.amountCents,
              counterparty: row.counterparty,
              reference: row.reference,
            },
            candidates,
          )
        : null;
    data.push({
      organizationId,
      importId: importRec.id,
      bookingDate: row.bookingDate,
      valueDate: row.valueDate,
      amountCents: row.amountCents,
      counterparty: row.counterparty,
      reference: row.reference,
      dedupeHash: hash,
      status: "PENDING",
      suggestedLeaseId: suggestion?.leaseId ?? null,
    });
  }

  let created = 0;
  if (data.length > 0) {
    const res = await db.bankTransaction.createMany({ data, skipDuplicates: true });
    created = res.count;
  }

  await writeAuditLog(db, {
    organizationId,
    userId: opts.userId ?? null,
    action: "bankImport.create",
    entityType: "BankImport",
    entityId: importRec.id,
    metadata: { fileName: input.fileName, created, duplicates },
  });

  return {
    importId: importRec.id,
    created,
    duplicates,
    skippedLines: parsed.skippedLines,
  };
}

/** PENDING bank transactions for the review/confirm screen, newest first. */
export function listPendingTransactions(
  db: PrismaClient,
  organizationId: string,
) {
  return db.bankTransaction.findMany({
    where: { organizationId, status: "PENDING" },
    orderBy: { bookingDate: "desc" },
    select: {
      id: true,
      bookingDate: true,
      valueDate: true,
      amountCents: true,
      counterparty: true,
      reference: true,
      suggestedLeaseId: true,
    },
  });
}

export interface ConfirmResult {
  bankTransactionId: string;
  status: "BOOKED" | "SKIPPED";
  paymentId?: string;
}

/**
 * Book a single PENDING bank transaction as a Payment for `leaseId`. Idempotent:
 * an already-booked line is skipped; the unique `Payment.bankTransactionId`
 * prevents a second booking even under a race.
 */
export async function confirmBankTransaction(
  db: PrismaClient,
  organizationId: string,
  input: { bankTransactionId: string; leaseId: string },
  opts: { userId?: string | null } = {},
): Promise<ConfirmResult> {
  const tx = await db.bankTransaction.findFirst({
    where: { id: input.bankTransactionId, organizationId },
    select: {
      id: true,
      status: true,
      amountCents: true,
      valueDate: true,
      bookingDate: true,
      counterparty: true,
      reference: true,
    },
  });
  if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "Kontoumsatz nicht gefunden." });
  if (tx.status !== "PENDING") {
    return { bankTransactionId: tx.id, status: "SKIPPED" };
  }
  if (tx.amountCents <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Nur Gutschriften (Eingänge) können als Zahlung verbucht werden.",
    });
  }

  const payment = await recordPayment(
    db,
    organizationId,
    {
      leaseId: input.leaseId,
      amountCents: tx.amountCents,
      valueDate: tx.valueDate ?? tx.bookingDate,
      counterparty: tx.counterparty ?? undefined,
      reference: tx.reference ?? undefined,
    },
    { userId: opts.userId, method: "BANK_IMPORT", bankTransactionId: tx.id },
  );

  await db.bankTransaction.update({
    where: { id: tx.id },
    data: { status: "BOOKED" },
  });

  return { bankTransactionId: tx.id, status: "BOOKED", paymentId: payment.paymentId };
}

/** Book several PENDING transactions in one call. */
export async function confirmBankTransactions(
  db: PrismaClient,
  organizationId: string,
  items: Array<{ bankTransactionId: string; leaseId: string }>,
  opts: { userId?: string | null } = {},
): Promise<ConfirmResult[]> {
  const results: ConfirmResult[] = [];
  for (const item of items) {
    results.push(await confirmBankTransaction(db, organizationId, item, opts));
  }
  return results;
}

/** Mark a PENDING transaction as intentionally ignored (not a rent payment). */
export async function ignoreBankTransaction(
  db: PrismaClient,
  organizationId: string,
  id: string,
): Promise<{ id: string }> {
  const tx = await db.bankTransaction.findFirst({
    where: { id, organizationId, status: "PENDING" },
    select: { id: true },
  });
  if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "Kontoumsatz nicht gefunden." });
  await db.bankTransaction.update({ where: { id }, data: { status: "IGNORED" } });
  return { id };
}
