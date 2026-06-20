import "server-only";

import { TRPCError } from "@trpc/server";

import { type PrismaClient } from "../../../generated/prisma";
import { writeAuditLog } from "~/server/audit";
import {
  type CreatePropertyInput,
  type CreateUnitInput,
  type UpdatePropertyInput,
  type UpdateUnitInput,
} from "./property.schema";

/**
 * Data access for the properties slice. Every function takes `organizationId`
 * explicitly and scopes all queries by it — the tenant boundary is never left
 * to the caller's discretion.
 */

const notFound = (what: string) =>
  new TRPCError({ code: "NOT_FOUND", message: `${what} nicht gefunden.` });

/** A blocking lease (active or future) prevents soft-deleting its parent. */
const blockingLeaseWhere = (now: Date) => ({
  deletedAt: null,
  OR: [{ endDate: null }, { endDate: { gte: now } }],
});

// ── Properties ────────────────────────────────────────────────────────────

export function listProperties(db: PrismaClient, organizationId: string) {
  return db.property.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      street: true,
      houseNo: true,
      postalCode: true,
      city: true,
      _count: { select: { units: { where: { deletedAt: null } } } },
    },
  });
}

export async function getProperty(
  db: PrismaClient,
  organizationId: string,
  id: string,
) {
  const property = await db.property.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: {
      units: {
        where: { deletedAt: null },
        orderBy: { label: "asc" },
      },
    },
  });
  if (!property) throw notFound("Objekt");
  return property;
}

export function createProperty(
  db: PrismaClient,
  organizationId: string,
  input: CreatePropertyInput,
) {
  return db.property.create({
    data: { ...input, organizationId },
    select: { id: true },
  });
}

export async function updateProperty(
  db: PrismaClient,
  organizationId: string,
  input: UpdatePropertyInput,
) {
  const { id, ...data } = input;
  await assertPropertyExists(db, organizationId, id);
  return db.property.update({
    where: { id },
    data,
    select: { id: true },
  });
}

export async function softDeleteProperty(
  db: PrismaClient,
  organizationId: string,
  id: string,
  userId: string,
) {
  await assertPropertyExists(db, organizationId, id);

  const blocking = await db.lease.count({
    where: {
      organizationId,
      unit: { propertyId: id },
      ...blockingLeaseWhere(new Date()),
    },
  });
  if (blocking > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Objekt hat aktive oder zukünftige Mietverhältnisse. Bitte zuerst beenden.",
    });
  }

  const result = await db.property.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true },
  });
  await writeAuditLog(db, {
    organizationId,
    userId,
    action: "property.softDelete",
    entityType: "Property",
    entityId: id,
  });
  return result;
}

async function assertPropertyExists(
  db: PrismaClient,
  organizationId: string,
  id: string,
) {
  const found = await db.property.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw notFound("Objekt");
}

// ── Units ───────────────────────────────────────────────────────────────────

export async function createUnit(
  db: PrismaClient,
  organizationId: string,
  input: CreateUnitInput,
) {
  // Ensure the parent property belongs to this organization.
  await assertPropertyExists(db, organizationId, input.propertyId);
  return db.unit.create({
    data: { ...input, organizationId },
    select: { id: true, propertyId: true },
  });
}

export async function updateUnit(
  db: PrismaClient,
  organizationId: string,
  input: UpdateUnitInput,
) {
  const { id, ...data } = input;
  await assertUnitExists(db, organizationId, id);
  return db.unit.update({
    where: { id },
    data,
    select: { id: true, propertyId: true },
  });
}

export async function softDeleteUnit(
  db: PrismaClient,
  organizationId: string,
  id: string,
  userId: string,
) {
  const unit = await assertUnitExists(db, organizationId, id);

  const blocking = await db.lease.count({
    where: { organizationId, unitId: id, ...blockingLeaseWhere(new Date()) },
  });
  if (blocking > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Einheit hat aktive oder zukünftige Mietverhältnisse. Bitte zuerst beenden.",
    });
  }

  const result = await db.unit.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true, propertyId: true },
  });
  await writeAuditLog(db, {
    organizationId,
    userId,
    action: "unit.softDelete",
    entityType: "Unit",
    entityId: id,
  });
  return { ...result, propertyId: unit.propertyId };
}

async function assertUnitExists(
  db: PrismaClient,
  organizationId: string,
  id: string,
) {
  const found = await db.unit.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, propertyId: true },
  });
  if (!found) throw notFound("Einheit");
  return found;
}
