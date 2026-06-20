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
// (same approach as the other flow specs).
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

test("Betriebskostenabrechnung anlegen → Ergebnis je Mieter → PDF erzeugen", async ({
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

  // 1) Neue Abrechnung für das MFH (mit umlagefähigen Belegen 2025) anlegen.
  await page.goto("/statements");
  await page.getByRole("button", { name: "Neue Abrechnung" }).click();
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: /Musterstraße/ }).click();
  await page.getByLabel("Abrechnungsjahr").fill("2025");
  await page.getByRole("button", { name: "Anlegen & berechnen" }).click();

  // 2) Detailseite: Kosten und Ergebnis je Mieter sind sichtbar.
  await expect(
    page.getByRole("heading", { name: /Betriebskostenabrechnung/ }),
  ).toBeVisible();
  await expect(page.getByText("Kosten & Verteilerschlüssel")).toBeVisible();
  await expect(page.getByText("Ergebnis je Mieter")).toBeVisible();
  // Mindestens ein Mieter-Ergebnis (Saldo: Nachzahlung oder Guthaben).
  await expect(
    page.getByText(/Nachzahlung|Guthaben|ausgeglichen/).first(),
  ).toBeVisible();

  // 3) PDF für den ersten Mieter erzeugen.
  await page.getByRole("button", { name: "PDF" }).first().click();
  await expect(page.getByText("PDF erzeugt.")).toBeVisible();
});
