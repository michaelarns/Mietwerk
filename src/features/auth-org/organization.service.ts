import "server-only";

import { type PrismaClient } from "../../../generated/prisma";
import { type UpdateOrganizationInput } from "./organization.schema";

/**
 * Data access for the auth-org slice. All functions that touch tenant data take
 * an explicit `organizationId` so the caller (the tRPC layer) stays the single
 * place that resolves and enforces the tenant boundary.
 */

/** Build a URL-safe, reasonably unique slug from an organization name. */
function buildSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "org"}-${suffix}`;
}

/**
 * Create a new organization and make the given user its OWNER. Used by the
 * onboarding flow (first organization) and by future "create organization"
 * actions. Not org-scoped — the user has no active organization yet.
 */
export async function createOrganizationForUser(
  db: PrismaClient,
  userId: string,
  name: string,
) {
  return db.organization.create({
    data: {
      name,
      slug: buildSlug(name),
      memberships: { create: { userId, role: "OWNER" } },
    },
    select: { id: true, name: true, slug: true },
  });
}

/** Organizations the given user belongs to, with their role in each. */
export function listUserOrganizations(db: PrismaClient, userId: string) {
  return db.membership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      organization: {
        select: { id: true, name: true, slug: true, planTier: true },
      },
    },
  });
}

/** Full profile of a single organization (already scoped by the tRPC layer). */
export function getOrganization(db: PrismaClient, organizationId: string) {
  return db.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      planTier: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
    },
  });
}

/** Members of an organization. */
export function listMembers(db: PrismaClient, organizationId: string) {
  return db.membership.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });
}

/** Update an organization's mutable profile fields. */
export function updateOrganization(
  db: PrismaClient,
  organizationId: string,
  input: UpdateOrganizationInput,
) {
  return db.organization.update({
    where: { id: organizationId },
    data: { name: input.name },
    select: { id: true, name: true },
  });
}
