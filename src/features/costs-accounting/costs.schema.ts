import { z } from "zod";

import {
  AllocationKey,
  ExpenseType,
  TransactionCategory,
} from "../../../generated/prisma";

/** Strictly positive integer Cent (eine Ausgabe ist > 0). */
const positiveCents = z.number().int().positive();
const optionalNonNegCents = z.number().int().nonnegative().nullish();

export const idInput = z.object({ id: z.string().cuid() });
export const propertyIdInput = z.object({ propertyId: z.string().cuid() });

/** Erfassung einer Kostenposition / eines Belegs. */
export const createTransactionSchema = z
  .object({
    propertyId: z.string().cuid().nullish(),
    unitId: z.string().cuid().nullish(),
    bookingDate: z.date(),
    paidDate: z.date().nullish(),
    category: z.nativeEnum(TransactionCategory).default(TransactionCategory.SONSTIGE),
    description: z.string().max(500).nullish(),
    amountCents: positiveCents,
    netAmountCents: optionalNonNegCents,
    isAllocatable: z.boolean().default(false),
    allocationKey: z.nativeEnum(AllocationKey).nullish(),
    isAfaRelevant: z.boolean().default(false),
    isLaborCost35a: z.boolean().default(false),
    expenseType: z.nativeEnum(ExpenseType).default(ExpenseType.SOFORTABZUG),
    distributionYears: z.number().int().min(2).max(5).nullish(),
    distributionStartYear: z.number().int().min(2000).max(2100).nullish(),
  })
  .superRefine((val, ctx) => {
    if (val.expenseType === ExpenseType.VERTEILUNG_82B && !val.distributionYears) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["distributionYears"],
        message: "§ 82b-Verteilung erfordert 2–5 Jahre.",
      });
    }
  });
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = z
  .object({
    id: z.string().cuid(),
    propertyId: z.string().cuid().nullish(),
    unitId: z.string().cuid().nullish(),
    bookingDate: z.date().optional(),
    paidDate: z.date().nullish(),
    category: z.nativeEnum(TransactionCategory).optional(),
    description: z.string().max(500).nullish(),
    amountCents: positiveCents.optional(),
    netAmountCents: optionalNonNegCents,
    isAllocatable: z.boolean().optional(),
    allocationKey: z.nativeEnum(AllocationKey).nullish(),
    isAfaRelevant: z.boolean().optional(),
    isLaborCost35a: z.boolean().optional(),
    expenseType: z.nativeEnum(ExpenseType).optional(),
    distributionYears: z.number().int().min(2).max(5).nullish(),
    distributionStartYear: z.number().int().min(2000).max(2100).nullish(),
  });
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const listTransactionsSchema = z
  .object({
    propertyId: z.string().cuid().optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    category: z.nativeEnum(TransactionCategory).optional(),
  })
  .optional();
export type ListTransactionsInput = z.infer<typeof listTransactionsSchema>;

/** Vorschau/Aufstellung für ein Objekt und Jahr. */
export const propertyYearSchema = z.object({
  propertyId: z.string().cuid(),
  year: z.number().int().min(2000).max(2100),
});
export type PropertyYearInput = z.infer<typeof propertyYearSchema>;

/** Regelbasierter Kategorievorschlag aus einem Buchungstext. */
export const suggestCategorySchema = z.object({ text: z.string().max(500) });
