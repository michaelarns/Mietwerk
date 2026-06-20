import {
  createTRPCRouter,
  orgProcedure,
  orgWriteProcedure,
} from "~/server/api/trpc";
import { categoryInfo, suggestCategory } from "./category-rules";
import {
  createTransaction,
  getTransaction,
  softDeleteTransaction,
  updateTransaction,
} from "./costs.service";
import {
  getAnlageV,
  getAnschaffungsnahStatus,
  listPropertyOptions,
  listTransactions,
} from "./queries.service";
import { buildAnlageVCsv, buildCostsCsv } from "./export.service";
import {
  createTransactionSchema,
  idInput,
  listTransactionsSchema,
  propertyIdInput,
  propertyYearSchema,
  suggestCategorySchema,
  updateTransactionSchema,
} from "./costs.schema";

/**
 * `costs-accounting` slice router. Reads über `orgProcedure`, Mutationen über
 * `orgWriteProcedure`. Beleg-Datei-Upload läuft über `/api/files/upload`.
 */
export const costRouter = createTRPCRouter({
  // ── 3.1/3.2 Belege & Kategorisierung ──
  list: orgProcedure
    .input(listTransactionsSchema)
    .query(({ ctx, input }) => listTransactions(ctx.db, ctx.organizationId, input)),

  byId: orgProcedure
    .input(idInput)
    .query(({ ctx, input }) => getTransaction(ctx.db, ctx.organizationId, input.id)),

  propertyOptions: orgProcedure.query(({ ctx }) =>
    listPropertyOptions(ctx.db, ctx.organizationId),
  ),

  /** Regelbasierter Kategorievorschlag (keine KI) inkl. Default-Zuordnung. */
  suggestCategory: orgProcedure
    .input(suggestCategorySchema)
    .query(({ input }) => {
      const category = suggestCategory(input.text);
      return { category, info: category ? categoryInfo(category) : null };
    }),

  create: orgWriteProcedure
    .input(createTransactionSchema)
    .mutation(({ ctx, input }) =>
      createTransaction(ctx.db, ctx.organizationId, input, {
        userId: ctx.session.user.id,
      }),
    ),

  update: orgWriteProcedure
    .input(updateTransactionSchema)
    .mutation(({ ctx, input }) =>
      updateTransaction(ctx.db, ctx.organizationId, input),
    ),

  softDelete: orgWriteProcedure
    .input(idInput)
    .mutation(({ ctx, input }) =>
      softDeleteTransaction(ctx.db, ctx.organizationId, input.id, {
        userId: ctx.session.user.id,
      }),
    ),

  // ── 3.2 Anschaffungsnahe HK (15 %-Warnung) ──
  anschaffungsnah: orgProcedure
    .input(propertyIdInput)
    .query(({ ctx, input }) =>
      getAnschaffungsnahStatus(ctx.db, ctx.organizationId, input.propertyId),
    ),

  // ── 3.5 Anlage-V-Aufstellung ──
  anlageV: orgProcedure
    .input(propertyYearSchema)
    .query(({ ctx, input }) =>
      getAnlageV(ctx.db, ctx.organizationId, input.propertyId, input.year),
    ),

  // ── 3.6 CSV-Export (Steuerberater) ──
  exportAnlageVCsv: orgProcedure
    .input(propertyYearSchema)
    .query(async ({ ctx, input }) => {
      const data = await getAnlageV(
        ctx.db,
        ctx.organizationId,
        input.propertyId,
        input.year,
      );
      return buildAnlageVCsv(data);
    }),

  exportCostsCsv: orgProcedure
    .input(listTransactionsSchema)
    .query(async ({ ctx, input }) => {
      const rows = await listTransactions(ctx.db, ctx.organizationId, input);
      return buildCostsCsv(
        rows.map((r) => ({
          bookingDate: r.bookingDate,
          paidDate: r.paidDate,
          propertyName: r.property?.name ?? null,
          unitLabel: r.unit?.label ?? null,
          category: r.category,
          description: r.description,
          amountCents: r.amountCents,
          netAmountCents: r.netAmountCents,
          isAllocatable: r.isAllocatable,
          expenseType: r.expenseType,
          isAfaRelevant: r.isAfaRelevant,
          isLaborCost35a: r.isLaborCost35a,
        })),
      );
    }),
});
