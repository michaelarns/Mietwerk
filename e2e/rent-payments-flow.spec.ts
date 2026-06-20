import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { PrismaClient } from "../generated/prisma";

// Load .env for local runs; in CI the variables come from the job environment.
try {
  process.loadEnvFile();
} catch {
  // ambient env
}

const db = new PrismaClient();

// Authenticate deterministically via a database session for the seeded owner
// (same approach as the Phase-1 flow spec).
let sessionToken: string;

test.beforeAll(async () => {
  const owner = await db.user.findUnique({
    where: { email: "owner-nord@example.test" },
  });
  if (!owner) {
    throw new Error("Seed-Daten fehlen — bitte `npm run db:seed` ausführen.");
  }
  sessionToken = randomUUID();
  await db.session.create({
    data: {
      sessionToken,
      userId: owner.id,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
});

test.afterAll(async () => {
  await db.session.deleteMany({ where: { sessionToken } });
  await db.$disconnect();
});

test("Sollstellung → Teilzahlung → überfällig → Mahnlauf (Erinnerung)", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: sessionToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const stamp = Date.now();
  const objektName = `E2E Geld ${stamp}`;
  const unitLabel = `E2E Einheit ${stamp}`;
  const lastName = `Zahlmann${stamp}`;

  // 1) Property + unit.
  await page.goto("/properties");
  await page.getByRole("button", { name: "Neues Objekt" }).click();
  await page.getByLabel("Bezeichnung").fill(objektName);
  await page.getByLabel("Straße").fill("Teststraße");
  await page.getByLabel("Nr.").fill("5");
  await page.getByLabel("PLZ").fill("20095");
  await page.getByLabel("Ort").fill("Hamburg");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await page.getByRole("link", { name: objektName }).click();
  await page.getByRole("button", { name: "Einheit hinzufügen" }).click();
  await page.getByLabel("Bezeichnung").fill(unitLabel);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByText(unitLabel)).toBeVisible();

  // 2) Tenant (with email -> dunning goes out as E-Mail to Mailpit).
  await page.goto("/tenants");
  await page.getByRole("button", { name: "Neuer Mieter" }).click();
  await page.getByLabel("Vorname").fill("Erika");
  await page.getByLabel("Nachname").fill(lastName);
  await page.getByLabel("E-Mail").fill(`e2e-${stamp}@example.test`);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByText(`${lastName}, Erika`)).toBeVisible();

  // 3) Lease, starting in the past so generated charges are overdue.
  await page.goto("/properties");
  await page.getByRole("link", { name: objektName }).click();
  await page.getByRole("button", { name: "Mietverhältnis anlegen" }).click();
  await page.getByLabel("Beginn").fill("2024-01-01");
  await page.getByLabel("Kaltmiete €").fill("800");
  await page.getByText(`${lastName}, Erika`).click();
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByText("Aktiv").first()).toBeVisible();

  const unit = await db.unit.findFirstOrThrow({ where: { label: unitLabel } });
  const lease = await db.lease.findFirstOrThrow({ where: { unitId: unit.id } });

  // 4) Generate the Sollstellung for a month ~3 months ago (overdue).
  const now = new Date();
  const past = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  await page.goto("/payments");
  await page.getByRole("button", { name: "Sollstellung" }).click();
  await page.getByLabel("Jahr").fill(String(past.getUTCFullYear()));
  await page.getByLabel("Monat").fill(String(past.getUTCMonth() + 1));
  await page.getByRole("button", { name: "Erzeugen" }).click();

  // 5) Record a partial payment on the lease overview.
  await page.goto(`/payments/leases/${lease.id}`);
  await expect(page.getByText("Forderungen (Soll/Ist)")).toBeVisible();
  await page.getByRole("button", { name: "Zahlung erfassen" }).click();
  await page.getByLabel("Betrag €").fill("400");
  await page.getByRole("button", { name: "Zahlung buchen" }).click();

  // Partial + overdue -> the receivable shows as "Überfällig"; a payment exists.
  await expect(page.getByText("Überfällig").first()).toBeVisible();
  await expect(page.getByText("Manuell").first()).toBeVisible();

  // 6) Run the dunning; the reminder appears on the lease overview.
  await page.goto("/payments");
  await page.getByRole("button", { name: "Mahnlauf starten" }).click();
  await page.goto(`/payments/leases/${lease.id}`);
  await expect(page.getByText("Mahnungen")).toBeVisible();
  await expect(page.getByText("Zahlungserinnerung").first()).toBeVisible();
});
