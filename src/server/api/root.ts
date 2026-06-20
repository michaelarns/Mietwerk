import { organizationRouter } from "~/features/auth-org/organization.router";
import { costRouter } from "~/features/costs-accounting/costs.router";
import { documentRouter } from "~/features/documents/document.router";
import { propertyRouter } from "~/features/properties/property.router";
import { rentPaymentRouter } from "~/features/rent-payments/rent-payments.router";
import { taxAfaRouter } from "~/features/tax-afa/tax-afa.router";
import {
  leaseRouter,
  tenantRouter,
} from "~/features/tenants-leases/tenants-leases.router";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * Each vertical slice contributes its own router here.
 */
export const appRouter = createTRPCRouter({
  organization: organizationRouter,
  property: propertyRouter,
  tenant: tenantRouter,
  lease: leaseRouter,
  document: documentRouter,
  rentPayment: rentPaymentRouter,
  cost: costRouter,
  taxAfa: taxAfaRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.organization.list();
 */
export const createCaller = createCallerFactory(appRouter);
