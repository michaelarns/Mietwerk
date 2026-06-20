import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

const emptyModule = fileURLToPath(new URL("./test/empty.ts", import.meta.url));
const authStub = fileURLToPath(new URL("./test/auth-stub.ts", import.meta.url));

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: [
      // RSC/client boundary markers are irrelevant under Vitest.
      { find: "server-only", replacement: emptyModule },
      { find: "client-only", replacement: emptyModule },
      // Keep NextAuth (next/server imports) out of the test runtime. Exact
      // match only, so `~/server/auth/*` subpaths stay real.
      { find: /^~\/server\/auth$/, replacement: authStub },
      // next-auth imports the extensionless "next/server", which Node's ESM
      // resolver can't find under Vitest — point it at the concrete file.
      { find: /^next\/server$/, replacement: "next/server.js" },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Unit/component tests live next to the code they cover.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Playwright e2e specs live under ./e2e and are run separately.
    exclude: ["node_modules", "e2e", ".next"],
  },
});
