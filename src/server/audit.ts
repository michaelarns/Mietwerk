import "server-only";

import { type Prisma, type PrismaClient } from "../../generated/prisma";

/**
 * Write an audit-log entry for a sensitive action (DSGVO / Nachvollziehbarkeit).
 * Always scoped to an organization. Call from services right after the action.
 */
export function writeAuditLog(
  db: PrismaClient,
  entry: {
    organizationId: string;
    userId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return db.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
    },
  });
}
