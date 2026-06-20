import "server-only";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { readActiveOrgId } from "~/server/auth/active-org";
import { resolveActiveOrganization } from "~/server/auth/tenancy";

export interface RequestOrgContext {
  userId: string;
  organizationId: string;
  role: "OWNER" | "MANAGER" | "ACCOUNTANT_READONLY";
}

/** Error carrying an HTTP status, thrown by {@link requireOrgFromRequest}. */
export class OrgAccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "OrgAccessError";
  }
}

/**
 * Resolve the active organization for a plain Request (route handlers that can't
 * go through tRPC, e.g. file upload/download). Mirrors the `orgProcedure`
 * chokepoint: same resolver, same membership check, same read-only rule.
 */
export async function requireOrgFromRequest(
  req: Request,
  opts: { write?: boolean } = {},
): Promise<RequestOrgContext> {
  const session = await auth();
  if (!session?.user) {
    throw new OrgAccessError(401, "Nicht angemeldet.");
  }

  const membership = await resolveActiveOrganization({
    db,
    userId: session.user.id,
    requestedOrgId: readActiveOrgId(req.headers),
  });
  if (!membership) {
    throw new OrgAccessError(403, "Kein Zugriff auf eine Organisation.");
  }
  if (opts.write && membership.role === "ACCOUNTANT_READONLY") {
    throw new OrgAccessError(403, "Diese Rolle darf keine Änderungen vornehmen.");
  }

  return {
    userId: session.user.id,
    organizationId: membership.organizationId,
    role: membership.role,
  };
}
