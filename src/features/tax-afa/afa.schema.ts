import { z } from "zod";

import { DepreciationMethod } from "../../../generated/prisma";

export const idInput = z.object({ id: z.string().cuid() });
export const propertyIdInput = z.object({ propertyId: z.string().cuid() });

/** Anlegen eines AfA-Plans. Fehlt `ratePercent`, leitet der Service ihn her. */
export const createScheduleSchema = z
  .object({
    propertyId: z.string().cuid(),
    method: z.nativeEnum(DepreciationMethod).default(DepreciationMethod.LINEAR),
    baseCents: z.number().int().positive(),
    ratePercent: z.number().positive().max(100).nullish(),
    usefulLifeYears: z.number().int().positive().max(200).nullish(),
    startYear: z.number().int().min(1900).max(2100),
    startMonth: z.number().int().min(1).max(12).default(1),
    note: z.string().max(500).nullish(),
  })
  .superRefine((val, ctx) => {
    if (val.method === DepreciationMethod.RESTNUTZUNGSDAUER && !val.usefulLifeYears) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["usefulLifeYears"],
        message: "Restnutzungsdauer (Jahre) ist erforderlich.",
      });
    }
  });
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
