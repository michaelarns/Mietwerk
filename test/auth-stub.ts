// Test stub for `~/server/auth`, aliased in vitest.config.ts. Keeps NextAuth
// (and its `next/server` imports, which don't resolve under Vitest) out of the
// test runtime. The tRPC context is built manually in tests, so `auth()` is
// never actually invoked.
export const auth = () => Promise.resolve(null);
export const handlers = {};
export const signIn = () => Promise.resolve(undefined);
export const signOut = () => Promise.resolve(undefined);
