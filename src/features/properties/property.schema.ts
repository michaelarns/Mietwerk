import { z } from "zod";

import { PropertyType } from "../../../generated/prisma";

const cents = z.number().int().nonnegative();
const optionalCents = cents.nullish();

/** Create a Property. Money values arrive as integer Cent. */
export const createPropertySchema = z.object({
  name: z.string().min(1, "Pflichtfeld").max(160),
  type: z.nativeEnum(PropertyType).default(PropertyType.MEHRFAMILIENHAUS),
  street: z.string().min(1, "Pflichtfeld").max(160),
  houseNo: z.string().min(1, "Pflichtfeld").max(20),
  postalCode: z.string().min(4, "PLZ prüfen").max(10),
  city: z.string().min(1, "Pflichtfeld").max(120),
  country: z.string().min(2).max(2).default("DE"),
  buildYear: z.number().int().min(1000).max(2200).nullish(),
  purchaseDate: z.date().nullish(),
  purchasePriceCents: optionalCents,
  landValueCents: optionalCents,
  buildingValueCents: optionalCents,
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = createPropertySchema.partial().extend({
  id: z.string().cuid(),
});
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

/** Create a Unit under a Property. */
export const createUnitSchema = z.object({
  propertyId: z.string().cuid(),
  label: z.string().min(1, "Pflichtfeld").max(120),
  floor: z.string().max(40).nullish(),
  rooms: z.number().positive().max(99).nullish(),
  areaSqm: z.number().positive().max(100000).nullish(),
  baseRentCents: optionalCents,
  operatingCostAdvanceCents: optionalCents,
});
export type CreateUnitInput = z.infer<typeof createUnitSchema>;

export const updateUnitSchema = createUnitSchema
  .omit({ propertyId: true })
  .partial()
  .extend({ id: z.string().cuid() });
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;

export const idInput = z.object({ id: z.string().cuid() });
