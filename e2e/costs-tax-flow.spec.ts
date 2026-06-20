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
// (same approach as the Phase-1/2 flow specs).
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

test("Beleg erfassen → AfA-Plan anlegen → Anlage-V-Vorschau mit korrekten Summen", async ({
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
  const objektName = `E2E Steuer ${stamp}`;
  // Veranlagungsjahr = abgeschlossenes Vorjahr (Default der Anlage-V-Vorschau).
  const year = new Date().getUTCFullYear() - 1;

  // 1) Objekt mit Gebäudeanteil + Kaufdatum anlegen (Basis für AfA-Vorschlag).
  await page.goto("/properties");
  await page.getByRole("button", { name: "Neues Objekt" }).click();
  await page.getByLabel("Bezeichnung").fill(objektName);
  await page.getByLabel("Straße").fill("Steuerweg");
  await page.getByLabel("Nr.").fill("7");
  await page.getByLabel("PLZ").fill("20095");
  await page.getByLabel("Ort").fill("Hamburg");
  await page.getByLabel("Baujahr").fill("2000");
  await page.getByLabel("Kaufdatum").fill("2019-06-01");
  await page.getByLabel("Gebäude-Anteil €").fill("300000");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByRole("link", { name: objektName })).toBeVisible();

  const property = await db.property.findFirstOrThrow({
    where: { name: objektName },
  });

  // 2) Beleg erfassen: Kategorie-Vorschlag aus dem Buchungstext, Sofortabzug.
  await page.goto("/costs");
  await page.getByRole("button", { name: "Beleg erfassen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Objekt").click();
  await page.getByRole("option", { name: objektName }).click();
  await dialog.getByLabel("Belegdatum").fill(`${year}-03-15`);
  await dialog.getByLabel("Zahlungsdatum (Abfluss)").fill(`${year}-03-15`);
  await dialog.getByLabel("Beschreibung").fill("Reparatur Heizung");
  await dialog.getByRole("button", { name: "Kategorie vorschlagen" }).click();
  await dialog.getByLabel("Betrag € (brutto)").fill("1000");
  await dialog.getByRole("button", { name: "Erfassen" }).click();

  // Beleg erscheint in der Liste, regelbasiert als Instandhaltung kategorisiert.
  await expect(page.getByText("Reparatur Heizung")).toBeVisible();
  await expect(page.getByText("Instandhaltung/Reparatur")).toBeVisible();

  // 3) AfA-Plan anlegen (Vorschlag vorbefüllt: linear 2 %, Basis 300.000 €).
  await page.goto(`/tax/${property.id}`);
  await page.getByRole("button", { name: "AfA-Plan anlegen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Plan anlegen" }).click();
  await expect(page.getByText("Linear (§ 7 Abs. 4)").first()).toBeVisible();

  // 4) Anlage-V-Vorschau für das Veranlagungsjahr: Erhaltungsaufwand 1.000 €,
  //    AfA 6.000 € (300.000 € × 2 %), Summe Werbungskosten 7.000 €.
  await page.getByLabel("Veranlagungsjahr").click();
  await page.getByRole("option", { name: String(year) }).click();

  const erhaltung = page
    .getByRole("row")
    .filter({ hasText: "Erhaltungsaufwand" });
  await expect(erhaltung).toContainText("1.000,00");

  const afaRow = page.getByRole("row").filter({ hasText: "AfA (Gebäudeabschreibung)" });
  await expect(afaRow).toContainText("6.000,00");

  const summe = page.getByRole("row").filter({ hasText: "Summe Werbungskosten" });
  await expect(summe).toContainText("7.000,00");

  await expect(page.getByText("Verlust")).toBeVisible();
});
