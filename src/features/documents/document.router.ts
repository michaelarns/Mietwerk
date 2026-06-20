import { z } from "zod";

import {
  createTRPCRouter,
  orgProcedure,
  orgWriteProcedure,
} from "~/server/api/trpc";
import {
  listPropertyDocuments,
  listUnitDocuments,
  softDeleteDocument,
} from "./document.service";

export const documentRouter = createTRPCRouter({
  listForProperty: orgProcedure
    .input(z.object({ propertyId: z.string().cuid() }))
    .query(({ ctx, input }) =>
      listPropertyDocuments(ctx.db, ctx.organizationId, input.propertyId),
    ),

  listForUnit: orgProcedure
    .input(z.object({ unitId: z.string().cuid() }))
    .query(({ ctx, input }) =>
      listUnitDocuments(ctx.db, ctx.organizationId, input.unitId),
    ),

  softDelete: orgWriteProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(({ ctx, input }) =>
      softDeleteDocument(
        ctx.db,
        ctx.organizationId,
        input.id,
        ctx.session.user.id,
      ),
    ),
});
