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

// We use database sessions (Auth.js + Prisma adapter), so we can authenticate a
// browser deterministically by inserting a Session row for the seeded owner and
// setting its opaque token as the session cookie — no OAuth/magic-link needed.
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

test("landlord creates property → unit → tenant → lease", async ({
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

  const objektName = `E2E Objekt ${Date.now()}`;

  // 1) Create a property.
  await page.goto("/properties");
  await page.getByRole("button", { name: "Neues Objekt" }).click();
  await page.getByLabel("Bezeichnung").fill(objektName);
  await page.getByLabel("Straße").fill("Teststraße");
  await page.getByLabel("Nr.").fill("5");
  await page.getByLabel("PLZ").fill("20095");
  await page.getByLabel("Ort").fill("Hamburg");
  await page.getByRole("button", { name: "Anlegen" }).click();

  await expect(page.getByRole("link", { name: objektName })).toBeVisible();

  // 2) Open detail and add a unit.
  await page.getByRole("link", { name: objektName }).click();
  await expect(
    page.getByRole("heading", { name: objektName }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Einheit hinzufügen" }).click();
  await page.getByLabel("Bezeichnung").fill("E2E Einheit");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByText("E2E Einheit")).toBeVisible();

  // 3) Create a tenant.
  await page.goto("/tenants");
  await page.getByRole("button", { name: "Neuer Mieter" }).click();
  await page.getByLabel("Vorname").fill("E2E");
  await page.getByLabel("Nachname").fill("Mieterperson");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByText("Mieterperson, E2E")).toBeVisible();

  // 4) Create a lease from the property detail.
  await page.goto("/properties");
  await page.getByRole("link", { name: objektName }).click();
  await page.getByRole("button", { name: "Mietverhältnis anlegen" }).click();
  await page.getByLabel("Beginn").fill("2025-01-01");
  await page.getByLabel("Kaltmiete €").fill("800");
  await page.getByText("Mieterperson, E2E").click(); // toggle tenant checkbox
  await page.getByRole("button", { name: "Anlegen" }).click();

  // The new lease appears with an "Aktiv" status badge.
  await expect(page.getByText("Aktiv").first()).toBeVisible();
});
