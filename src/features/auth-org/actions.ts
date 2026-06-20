"use server";

import { cookies } from "next/headers";

import { auth } from "~/server/auth";
import { ACTIVE_ORG_COOKIE } from "~/server/auth/active-org";
import { db } from "~/server/db";

/**
 * Set the active organization for the current user. Validates membership before
 * writing the cookie that the tRPC tenancy chokepoint reads — a user can never
 * activate an organization they do not belong to.
 */
export async function setActiveOrganization(organizationId: string) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Nicht angemeldet.");
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: session.user.id },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new Error("Keine Mitgliedschaft in dieser Organisation.");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
