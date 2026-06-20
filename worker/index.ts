/**
 * Mietwerk background worker — Phase 2 (pg-boss).
 *
 * Runs the recurring money-flow jobs: monthly Sollstellung and the daily
 * dunning run (ADR 0007). pg-boss keeps its own `pgboss` schema, separate from
 * the Prisma app schema. Both queues use the `singleton` policy so scheduled
 * runs never overlap; the job logic is idempotent.
 *
 * Run via `npm run dev` (with the app) or `npm run dev:worker`. The
 * `--conditions=react-server` flag (see package.json) neutralises the
 * `server-only` guard for this plain Node process.
 */
import { PgBoss } from "pg-boss";

import { env } from "~/env";
import { db } from "~/server/db";
import {
  DUNNING_QUEUE,
  RENT_CHARGE_QUEUE,
  runDunningJob,
  runRentChargeJob,
} from "~/features/rent-payments/jobs";

const TZ = "Europe/Berlin";

function log(message: string) {
  console.log(`[worker] ${new Date().toISOString()} ${message}`);
}

async function main() {
  log("starting…");

  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss" });
  boss.on("error", (err) => log(`pg-boss error: ${String(err)}`));
  await boss.start();
  log("pg-boss started (schema 'pgboss')");

  // Singleton queues -> only one active run at a time (overlap-safe).
  await boss.createQueue(RENT_CHARGE_QUEUE, { policy: "singleton" });
  await boss.createQueue(DUNNING_QUEUE, { policy: "singleton" });

  await boss.work(RENT_CHARGE_QUEUE, async () => {
    const res = await runRentChargeJob(db);
    log(`rent-charge done: ${JSON.stringify(res)}`);
  });
  await boss.work(DUNNING_QUEUE, async () => {
    const res = await runDunningJob(db);
    log(`dunning-run done: ${JSON.stringify(res)}`);
  });

  // Cron schedules in Europe/Berlin: Sollstellung on the 1st at 06:00,
  // dunning daily at 07:00.
  await boss.schedule(RENT_CHARGE_QUEUE, "0 6 1 * *", null, { tz: TZ });
  await boss.schedule(DUNNING_QUEUE, "0 7 * * *", null, { tz: TZ });
  log("schedules registered (rent-charge monthly, dunning daily)");
  log("ready");

  const shutdown = (signal: string) => {
    log(`received ${signal}, shutting down`);
    void boss
      .stop()
      .then(() => db.$disconnect())
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  log(`fatal: ${String(err)}`);
  void db.$disconnect().finally(() => process.exit(1));
});
