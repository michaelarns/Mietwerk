import { z } from "zod";

import { LeaseType } from "../../../generated/prisma";

const cents = z.number().int().nonnegative();

// ── Tenant ──
export const createTenantSchema = z.object({
  firstName: z.string().min(1, "Pflichtfeld").max(120),
  lastName: z.string().min(1, "Pflichtfeld").max(120),
  email: z.string().email("E-Mail prüfen").nullish().or(z.literal("")),
  phone: z.string().max(40).nullish(),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = createTenantSchema.partial().extend({
  id: z.string().cuid(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

// ── Lease ──
export const createLeaseSchema = z
  .object({
    unitId: z.string().cuid(),
    type: z.nativeEnum(LeaseType).default(LeaseType.STANDARD),
    startDate: z.date(),
    endDate: z.date().nullish(),
    baseRentCents: cents,
    operatingCostAdvanceCents: cents.default(0),
    depositCents: cents.default(0),
    tenantIds: z.array(z.string().cuid()).min(1, "Mindestens ein Mieter"),
  })
  .refine(
    (v) => v.endDate == null || v.endDate.getTime() >= v.startDate.getTime(),
    { message: "Ende darf nicht vor dem Beginn liegen.", path: ["endDate"] },
  );
export type CreateLeaseInput = z.infer<typeof createLeaseSchema>;

export const updateLeaseSchema = z
  .object({
    id: z.string().cuid(),
    type: z.nativeEnum(LeaseType).optional(),
    startDate: z.date().optional(),
    endDate: z.date().nullish(),
    baseRentCents: cents.optional(),
    operatingCostAdvanceCents: cents.optional(),
    depositCents: cents.optional(),
    tenantIds: z.array(z.string().cuid()).min(1).optional(),
  })
  .refine(
    (v) =>
      v.endDate == null ||
      v.startDate == null ||
      v.endDate.getTime() >= v.startDate.getTime(),
    { message: "Ende darf nicht vor dem Beginn liegen.", path: ["endDate"] },
  );
export type UpdateLeaseInput = z.infer<typeof updateLeaseSchema>;

export const idInput = z.object({ id: z.string().cuid() });
export const propertyIdInput = z.object({ propertyId: z.string().cuid() });
