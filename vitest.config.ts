import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    // Unit/component tests live next to the code they cover.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Playwright e2e specs live under ./e2e and are run separately.
    exclude: ["node_modules", "e2e", ".next"],
  },
});
