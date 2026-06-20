import {
  createTRPCRouter,
  orgProcedure,
  orgWriteProcedure,
} from "~/server/api/trpc";
import {
  createScheduleSchema,
  idInput,
  propertyIdInput,
} from "./afa.schema";
import {
  createSchedule,
  deleteSchedule,
  listSchedulesForProperty,
  suggestScheduleForProperty,
} from "./afa.service";

/**
 * `tax-afa` slice router. Reads über `orgProcedure`, Mutationen über
 * `orgWriteProcedure` — der Tenancy-Chokepoint scoped jeden Aufruf.
 */
export const taxAfaRouter = createTRPCRouter({
  listForProperty: orgProcedure
    .input(propertyIdInput)
    .query(({ ctx, input }) =>
      listSchedulesForProperty(ctx.db, ctx.organizationId, input.propertyId),
    ),

  /** Vorschlag (Methode/Satz/Basis) aus den Objekt-Stammdaten. */
  suggest: orgProcedure
    .input(propertyIdInput)
    .query(({ ctx, input }) =>
      suggestScheduleForProperty(ctx.db, ctx.organizationId, input.propertyId),
    ),

  create: orgWriteProcedure
    .input(createScheduleSchema)
    .mutation(({ ctx, input }) =>
      createSchedule(ctx.db, ctx.organizationId, input, {
        userId: ctx.session.user.id,
      }),
    ),

  delete: orgWriteProcedure
    .input(idInput)
    .mutation(({ ctx, input }) =>
      deleteSchedule(ctx.db, ctx.organizationId, input.id, {
        userId: ctx.session.user.id,
      }),
    ),
});
