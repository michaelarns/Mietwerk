import "server-only";

import { TRPCError } from "@trpc/server";

import { type DocumentType, type PrismaClient } from "../../../generated/prisma";
import { writeAuditLog } from "~/server/audit";

/**
 * Data access for document metadata. The binary lives in the storage port
 * (see ADR 0005); this service only manages the `Document` rows and is always
 * org-scoped. Ownership of the parent (Property/Unit) is verified here.
 */

const notFound = (what: string) =>
  new TRPCError({ code: "NOT_FOUND", message: `${what} nicht gefunden.` });

const documentSelect = {
  id: true,
  type: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
} as const;

export async function assertPropertyOwned(
  db: PrismaClient,
  organizationId: string,
  propertyId: string,
) {
  const found = await db.property.findFirst({
    where: { id: propertyId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw notFound("Objekt");
}

export async function assertUnitOwned(
  db: PrismaClient,
  organizationId: string,
  unitId: string,
) {
  const found = await db.unit.findFirst({
    where: { id: unitId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw notFound("Einheit");
}

export function listPropertyDocuments(
  db: PrismaClient,
  organizationId: string,
  propertyId: string,
) {
  return db.document.findMany({
    where: { organizationId, propertyId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: documentSelect,
  });
}

export function listUnitDocuments(
  db: PrismaClient,
  organizationId: string,
  unitId: string,
) {
  return db.document.findMany({
    where: { organizationId, unitId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: documentSelect,
  });
}

export function createDocument(
  db: PrismaClient,
  organizationId: string,
  input: {
    type: DocumentType;
    fileName: string;
    fileKey: string;
    mimeType?: string;
    sizeBytes?: number;
    propertyId?: string;
    unitId?: string;
  },
) {
  return db.document.create({
    data: { organizationId, ...input },
    select: { id: true },
  });
}

/** Fetch a document's storage info, scoped to the organization. */
export async function getDocumentForDownload(
  db: PrismaClient,
  organizationId: string,
  id: string,
) {
  const doc = await db.document.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, fileKey: true, fileName: true, mimeType: true },
  });
  if (!doc) throw notFound("Dokument");
  return doc;
}

export async function softDeleteDocument(
  db: PrismaClient,
  organizationId: string,
  id: string,
  userId: string,
) {
  const doc = await db.document.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!doc) throw notFound("Dokument");

  const result = await db.document.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true },
  });
  await writeAuditLog(db, {
    organizationId,
    userId,
    action: "document.softDelete",
    entityType: "Document",
    entityId: id,
  });
  return result;
}
