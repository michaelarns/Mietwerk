import { z } from "zod";

/** Update mutable organization profile fields. */
export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(120),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

/** Create a new organization (onboarding / additional mandate). */
export const createOrganizationSchema = z.object({
  name: z.string().min(2, "Mindestens 2 Zeichen").max(120),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
