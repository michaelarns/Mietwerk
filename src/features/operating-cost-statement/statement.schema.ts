import { z } from "zod";

/** Gemeinsame Eingaben für den `operatingCostStatement`-Slice (Zod-validiert). */

export const statementIdInput = z.object({ statementId: z.string().min(1) });

export const createStatementSchema = z
  .object({
    propertyId: z.string().min(1),
    periodYear: z.number().int().min(2000).max(2100),
    // Zeitraum optional — Default ist das Kalenderjahr (konfigurierbar,
    // höchstens 12 Monate, § 556 Abs. 3 BGB).
    periodStart: z.date().optional(),
    periodEnd: z.date().optional(),
    title: z.string().max(200).optional(),
    advanceBasis: z.enum(["SOLL", "IST"]).optional(),
    // Verbrauchsanteil Heizkosten in Basispunkten (50–70 % laut HeizkostenV).
    heatingConsumptionShareBp: z.number().int().min(0).max(10000).optional(),
  })
  .refine(
    (v) =>
      !v.periodStart || !v.periodEnd || v.periodEnd.getTime() >= v.periodStart.getTime(),
    { message: "Das Ende darf nicht vor dem Beginn liegen.", path: ["periodEnd"] },
  );

export const updateStatementSchema = z.object({
  statementId: z.string().min(1),
  title: z.string().max(200).nullish(),
  advanceBasis: z.enum(["SOLL", "IST"]).optional(),
  heatingConsumptionShareBp: z.number().int().min(0).max(10000).optional(),
});

export const setConsumptionSchema = z.object({
  statementId: z.string().min(1),
  itemId: z.string().min(1),
  unitId: z.string().min(1),
  value: z.number().min(0),
});

export const generatePdfSchema = z.object({
  statementId: z.string().min(1),
  leaseId: z.string().min(1),
});

export type CreateStatementInput = z.infer<typeof createStatementSchema>;
export type UpdateStatementInput = z.infer<typeof updateStatementSchema>;
export type SetConsumptionInput = z.infer<typeof setConsumptionSchema>;
