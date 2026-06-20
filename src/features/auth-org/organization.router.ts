import {
  createTRPCRouter,
  orgProcedure,
  orgWriteProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "./organization.schema";
import {
  createOrganizationForUser,
  getOrganization,
  listMembers,
  listUserOrganizations,
  updateOrganization,
} from "./organization.service";

/**
 * auth-org slice router: organizations, memberships and the caller's tenancy
 * context. All organization-scoped procedures build on `orgProcedure`, the
 * central multi-tenancy chokepoint.
 */
export const organizationRouter = createTRPCRouter({
  /** Organizations the logged-in user can access (across all tenants). */
  list: protectedProcedure.query(({ ctx }) =>
    listUserOrganizations(ctx.db, ctx.session.user.id),
  ),

  /** Create a new organization and become its OWNER (onboarding). */
  create: protectedProcedure
    .input(createOrganizationSchema)
    .mutation(({ ctx, input }) =>
      createOrganizationForUser(ctx.db, ctx.session.user.id, input.name),
    ),

  /** The currently active organization plus the caller's role within it. */
  current: orgProcedure.query(async ({ ctx }) => {
    const organization = await getOrganization(ctx.db, ctx.organizationId);
    return { organization, role: ctx.membership.role };
  }),

  /** Members of the active organization. */
  members: orgProcedure.query(({ ctx }) =>
    listMembers(ctx.db, ctx.organizationId),
  ),

  /** Update the active organization's profile (write roles only). */
  update: orgWriteProcedure
    .input(updateOrganizationSchema)
    .mutation(({ ctx, input }) =>
      updateOrganization(ctx.db, ctx.organizationId, input),
    ),
});
