import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import NodemailerProvider from "next-auth/providers/nodemailer";

import { env } from "~/env";
import { db } from "~/server/db";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://authjs.dev/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * Uses database sessions (via the Prisma adapter), which the Email/magic-link
 * provider requires. The active organization and the user's role are resolved
 * server-side in the tRPC context, not stored on the session.
 *
 * @see https://authjs.dev/getting-started
 */
export const authConfig = {
  providers: [
    GitHubProvider({
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
    }),
    NodemailerProvider({
      server: {
        host: env.EMAIL_SERVER_HOST,
        port: env.EMAIL_SERVER_PORT,
        auth:
          env.EMAIL_SERVER_USER && env.EMAIL_SERVER_PASSWORD
            ? {
                user: env.EMAIL_SERVER_USER,
                pass: env.EMAIL_SERVER_PASSWORD,
              }
            : undefined,
      },
      from: env.EMAIL_FROM,
    }),
  ],
  adapter: PrismaAdapter(db),
  callbacks: {
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
      },
    }),
  },
} satisfies NextAuthConfig;
