import {
  createTRPCRouter,
  orgProcedure,
  orgWriteProcedure,
} from "~/server/api/trpc";
import {
  createPropertySchema,
  createUnitSchema,
  idInput,
  updatePropertySchema,
  updateUnitSchema,
} from "./property.schema";
import {
  createProperty,
  createUnit,
  getProperty,
  listProperties,
  softDeleteProperty,
  softDeleteUnit,
  updateProperty,
  updateUnit,
} from "./property.service";

export const propertyRouter = createTRPCRouter({
  list: orgProcedure.query(({ ctx }) =>
    listProperties(ctx.db, ctx.organizationId),
  ),

  byId: orgProcedure
    .input(idInput)
    .query(({ ctx, input }) =>
      getProperty(ctx.db, ctx.organizationId, input.id),
    ),

  create: orgWriteProcedure
    .input(createPropertySchema)
    .mutation(({ ctx, input }) =>
      createProperty(ctx.db, ctx.organizationId, input),
    ),

  update: orgWriteProcedure
    .input(updatePropertySchema)
    .mutation(({ ctx, input }) =>
      updateProperty(ctx.db, ctx.organizationId, input),
    ),

  softDelete: orgWriteProcedure
    .input(idInput)
    .mutation(({ ctx, input }) =>
      softDeleteProperty(
        ctx.db,
        ctx.organizationId,
        input.id,
        ctx.session.user.id,
      ),
    ),

  // ── Units ──
  createUnit: orgWriteProcedure
    .input(createUnitSchema)
    .mutation(({ ctx, input }) =>
      createUnit(ctx.db, ctx.organizationId, input),
    ),

  updateUnit: orgWriteProcedure
    .input(updateUnitSchema)
    .mutation(({ ctx, input }) =>
      updateUnit(ctx.db, ctx.organizationId, input),
    ),

  softDeleteUnit: orgWriteProcedure
    .input(idInput)
    .mutation(({ ctx, input }) =>
      softDeleteUnit(
        ctx.db,
        ctx.organizationId,
        input.id,
        ctx.session.user.id,
      ),
    ),
});
