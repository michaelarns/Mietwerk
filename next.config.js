/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // PDF-Erzeugung (@react-pdf/renderer) läuft nur serverseitig (ADR 0003/0010);
  // nicht ins Client-/Server-Bundle hineinkompilieren.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default config;
