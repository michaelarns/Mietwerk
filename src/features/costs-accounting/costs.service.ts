import "server-only";

import { TRPCError } from "@trpc/server";

import { type PrismaClient } from "../../../generated/prisma";
import { writeAuditLog } from "~/server/audit";
import {
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from "./costs.schema";

/**
 * Data access für Belege/Kostenpositionen (`Transaction`). Org-gescoped;
 * Soft-Delete + Audit für sensible Aktionen. Parent-Ownership (Property/Unit)
 * wird geprüft. Beleg-Dateien laufen über den Storage-Port (siehe
 * `/api/files/upload`, ADR 0005) und hängen über `documents` an der Transaction.
 */

const notFound = (what: string) =>
  new TRPCError({ code: "NOT_FOUND", message: `${what} nicht gefunden.` });

async function assertParentsOwned(
  db: PrismaClient,
  organizationId: string,
  propertyId?: string | null,
  unitId?: string | null,
) {
  if (propertyId) {
    const p = await db.property.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!p) throw notFound("Objekt");
  }
  if (unitId) {
    const u = await db.unit.findFirst({
      where: { id: unitId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!u) throw notFound("Einheit");
  }
}

async function assertTransactionExists(
  db: PrismaClient,
  organizationId: string,
  id: string,
) {
  const found = await db.transaction.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw notFound("Kostenposition");
}

export async function createTransaction(
  db: PrismaClient,
  organizationId: string,
  input: CreateTransactionInput,
  actor: { userId: string },
) {
  await assertParentsOwned(db, organizationId, input.propertyId, input.unitId);

  const tx = await db.transaction.create({
    data: {
      organizationId,
      propertyId: input.propertyId ?? null,
      unitId: input.unitId ?? null,
      bookingDate: input.bookingDate,
      paidDate: input.paidDate ?? null,
      category: input.category,
      description: input.description ?? null,
      amountCents: input.amountCents,
      netAmountCents: input.netAmountCents ?? null,
      isAllocatable: input.isAllocatable,
      allocationKey: input.allocationKey ?? null,
      isAfaRelevant: input.isAfaRelevant,
      isLaborCost35a: input.isLaborCost35a,
      expenseType: input.expenseType,
      distributionYears: input.distributionYears ?? null,
      distributionStartYear: input.distributionStartYear ?? null,
    },
    select: { id: true },
  });
  await writeAuditLog(db, {
    organizationId,
    userId: actor.userId,
    action: "cost.create",
    entityType: "Transaction",
    entityId: tx.id,
    metadata: { category: input.category, amountCents: input.amountCents },
  });
  return tx;
}

export async function updateTransaction(
  db: PrismaClient,
  organizationId: string,
  input: UpdateTransactionInput,
) {
  const { id, ...rest } = input;
  await assertTransactionExists(db, organizationId, id);
  await assertParentsOwned(db, organizationId, rest.propertyId, rest.unitId);

  return db.transaction.update({
    where: { id },
    data: rest,
    select: { id: true },
  });
}

export async function softDeleteTransaction(
  db: PrismaClient,
  organizationId: string,
  id: string,
  actor: { userId: string },
) {
  await assertTransactionExists(db, organizationId, id);
  const result = await db.transaction.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true },
  });
  await writeAuditLog(db, {
    organizationId,
    userId: actor.userId,
    action: "cost.softDelete",
    entityType: "Transaction",
    entityId: id,
  });
  return result;
}

export async function getTransaction(
  db: PrismaClient,
  organizationId: string,
  id: string,
) {
  const tx = await db.transaction.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, label: true } },
      documents: {
        where: { deletedAt: null },
        select: { id: true, fileName: true, mimeType: true, createdAt: true },
      },
    },
  });
  if (!tx) throw notFound("Kostenposition");
  return tx;
}
