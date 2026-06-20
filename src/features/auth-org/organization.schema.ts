import { z } from "zod";

/** Update mutable organization profile fields. */
export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(120),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
