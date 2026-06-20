/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { readActiveOrgId } from "~/server/auth/active-org";
import { resolveActiveOrganization } from "~/server/auth/tenancy";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();

  return {
    db,
    session,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * Verifies the session is valid and guarantees `ctx.session.user` is not null.
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });

/**
 * Organization (multi-tenant) procedure — THE SINGLE TENANCY CHOKEPOINT.
 *
 * This is the only place where the active organization is resolved and a
 * caller's membership is verified. Every domain procedure MUST build on this
 * (or on a procedure derived from it) so that no slice can accidentally read or
 * write across tenant boundaries. The resolved `organizationId` and `role` are
 * injected into the context; services then scope all queries by
 * `ctx.organizationId`.
 *
 * The active organization is taken from the `x-organization-id` header or the
 * `mw_active_org` cookie when present (and the caller is a member of it);
 * otherwise it falls back to the caller's first membership.
 */
export const orgProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const requestedOrgId = readActiveOrgId(ctx.headers);

  const membership = await resolveActiveOrganization({
    db: ctx.db,
    userId: ctx.session.user.id,
    requestedOrgId,
  });

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Kein Zugriff auf eine Organisation.",
    });
  }

  return next({
    ctx: {
      organizationId: membership.organizationId,
      membership,
    },
  });
});

/**
 * Write procedure — like {@link orgProcedure} but forbids read-only roles
 * (`ACCOUNTANT_READONLY`) from performing mutations.
 */
export const orgWriteProcedure = orgProcedure.use(({ ctx, next }) => {
  if (ctx.membership.role === "ACCOUNTANT_READONLY") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Diese Rolle darf keine Änderungen vornehmen.",
    });
  }
  return next();
});
