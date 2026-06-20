import "server-only";

import { type PrismaClient, type UserRole } from "../../../generated/prisma";

export interface ActiveMembership {
  membershipId: string;
  organizationId: string;
  role: UserRole;
}

/**
 * Resolve the active organization for a user, used by the tRPC tenancy
 * chokepoint (`orgProcedure`).
 *
 * - If `requestedOrgId` is provided and the user is a member of it, that
 *   organization is returned.
 * - Otherwise the user's earliest membership is used as the default.
 * - Returns `null` if the user has no (matching) membership.
 *
 * This is the only function that maps a user to an organization context; keep
 * the multi-tenancy logic here so it cannot be bypassed by individual slices.
 */
export async function resolveActiveOrganization(opts: {
  db: PrismaClient;
  userId: string;
  requestedOrgId?: string;
}): Promise<ActiveMembership | null> {
  const { db, userId, requestedOrgId } = opts;

  if (requestedOrgId) {
    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: { organizationId: requestedOrgId, userId },
      },
      select: { id: true, organizationId: true, role: true },
    });
    if (membership) {
      return {
        membershipId: membership.id,
        organizationId: membership.organizationId,
        role: membership.role,
      };
    }
    // Requested an org the user is not part of: fall through to default.
  }

  const fallback = await db.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, organizationId: true, role: true },
  });

  if (!fallback) return null;

  return {
    membershipId: fallback.id,
    organizationId: fallback.organizationId,
    role: fallback.role,
  };
}
