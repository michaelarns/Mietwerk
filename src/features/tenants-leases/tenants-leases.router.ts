import {
  createTRPCRouter,
  orgProcedure,
  orgWriteProcedure,
} from "~/server/api/trpc";
import {
  createLeaseSchema,
  createTenantSchema,
  idInput,
  propertyIdInput,
  updateLeaseSchema,
  updateTenantSchema,
} from "./tenants-leases.schema";
import {
  createLease,
  createTenant,
  getLease,
  getTenant,
  listLeasesForProperty,
  listTenants,
  softDeleteLease,
  softDeleteTenant,
  updateLease,
  updateTenant,
} from "./tenants-leases.service";

export const tenantRouter = createTRPCRouter({
  list: orgProcedure.query(({ ctx }) => listTenants(ctx.db, ctx.organizationId)),

  byId: orgProcedure
    .input(idInput)
    .query(({ ctx, input }) => getTenant(ctx.db, ctx.organizationId, input.id)),

  create: orgWriteProcedure
    .input(createTenantSchema)
    .mutation(({ ctx, input }) =>
      createTenant(ctx.db, ctx.organizationId, input),
    ),

  update: orgWriteProcedure
    .input(updateTenantSchema)
    .mutation(({ ctx, input }) =>
      updateTenant(ctx.db, ctx.organizationId, input),
    ),

  softDelete: orgWriteProcedure
    .input(idInput)
    .mutation(({ ctx, input }) =>
      softDeleteTenant(
        ctx.db,
        ctx.organizationId,
        input.id,
        ctx.session.user.id,
      ),
    ),
});

export const leaseRouter = createTRPCRouter({
  listForProperty: orgProcedure
    .input(propertyIdInput)
    .query(({ ctx, input }) =>
      listLeasesForProperty(ctx.db, ctx.organizationId, input.propertyId),
    ),

  byId: orgProcedure
    .input(idInput)
    .query(({ ctx, input }) => getLease(ctx.db, ctx.organizationId, input.id)),

  create: orgWriteProcedure
    .input(createLeaseSchema)
    .mutation(({ ctx, input }) =>
      createLease(ctx.db, ctx.organizationId, input),
    ),

  update: orgWriteProcedure
    .input(updateLeaseSchema)
    .mutation(({ ctx, input }) =>
      updateLease(ctx.db, ctx.organizationId, input),
    ),

  softDelete: orgWriteProcedure
    .input(idInput)
    .mutation(({ ctx, input }) =>
      softDeleteLease(
        ctx.db,
        ctx.organizationId,
        input.id,
        ctx.session.user.id,
      ),
    ),
});
