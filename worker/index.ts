/**
 * Mietwerk background worker — Phase 1 placeholder.
 *
 * For now this process only proves the local process model and dev
 * orchestration: it connects to the database, logs its readiness and stays
 * alive with a heartbeat. No pg-boss and no jobs yet — those arrive with the
 * `notifications-jobs` slice (see docs/decisions/0004-background-jobs.md).
 */
import { PrismaClient } from "../generated/prisma";

const HEARTBEAT_MS = 60_000;
const db = new PrismaClient();

function log(message: string) {
  console.log(`[worker] ${new Date().toISOString()} ${message}`);
}

async function main() {
  log("starting…");

  // Verify the database connection before declaring readiness.
  await db.$queryRaw`SELECT 1`;
  log("database connection OK — worker ready (placeholder, no jobs)");

  const heartbeat = setInterval(() => {
    log("alive");
  }, HEARTBEAT_MS);

  const shutdown = (signal: string) => {
    log(`received ${signal}, shutting down`);
    clearInterval(heartbeat);
    void db.$disconnect().finally(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  log(`fatal: ${String(err)}`);
  void db.$disconnect().finally(() => process.exit(1));
});
