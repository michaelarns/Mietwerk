import {
  createTRPCRouter,
  orgProcedure,
  orgWriteProcedure,
} from "~/server/api/trpc";
import {
  createStatement,
  deleteStatement,
  finalizeStatement,
  runStatement,
  setConsumption,
  updateStatement,
} from "./statement.service";
import {
  getStatementDetail,
  listPropertyOptions,
  listStatements,
} from "./queries.service";
import { generateStatementPdf } from "./pdf/statement-pdf.service";
import {
  createStatementSchema,
  generatePdfSchema,
  setConsumptionSchema,
  statementIdInput,
  updateStatementSchema,
} from "./statement.schema";

/**
 * `operatingCostStatement` slice router — Betriebskostenabrechnung.
 * Reads über `orgProcedure`, Mutationen über `orgWriteProcedure` (der zentrale
 * Mandanten-Chokepoint). PDF-Erzeugung/-Download laufen über `/api/files/*`.
 */
export const operatingCostStatementRouter = createTRPCRouter({
  list: orgProcedure.query(({ ctx }) => listStatements(ctx.db, ctx.organizationId)),

  propertyOptions: orgProcedure.query(({ ctx }) =>
    listPropertyOptions(ctx.db, ctx.organizationId),
  ),

  byId: orgProcedure
    .input(statementIdInput)
    .query(({ ctx, input }) =>
      getStatementDetail(ctx.db, ctx.organizationId, input.statementId),
    ),

  create: orgWriteProcedure
    .input(createStatementSchema)
    .mutation(({ ctx, input }) =>
      createStatement(ctx.db, ctx.organizationId, input, {
        userId: ctx.session.user.id,
      }),
    ),

  run: orgWriteProcedure
    .input(statementIdInput)
    .mutation(({ ctx, input }) =>
      runStatement(ctx.db, ctx.organizationId, input.statementId, {
        userId: ctx.session.user.id,
      }),
    ),

  setConsumption: orgWriteProcedure
    .input(setConsumptionSchema)
    .mutation(({ ctx, input }) =>
      setConsumption(ctx.db, ctx.organizationId, input),
    ),

  update: orgWriteProcedure
    .input(updateStatementSchema)
    .mutation(({ ctx, input }) =>
      updateStatement(ctx.db, ctx.organizationId, input),
    ),

  finalize: orgWriteProcedure
    .input(statementIdInput)
    .mutation(({ ctx, input }) =>
      finalizeStatement(ctx.db, ctx.organizationId, input.statementId, {
        userId: ctx.session.user.id,
      }),
    ),

  delete: orgWriteProcedure
    .input(statementIdInput)
    .mutation(({ ctx, input }) =>
      deleteStatement(ctx.db, ctx.organizationId, input.statementId, {
        userId: ctx.session.user.id,
      }),
    ),

  /** 4.4 PDF je Mieter erzeugen; Rückgabe der Document-ID für /api/files/[id]. */
  generatePdf: orgWriteProcedure
    .input(generatePdfSchema)
    .mutation(({ ctx, input }) =>
      generateStatementPdf(ctx.db, ctx.organizationId, input.statementId, input.leaseId, {
        userId: ctx.session.user.id,
      }),
    ),
});
