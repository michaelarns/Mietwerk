import { expect, test } from "@playwright/test";

test("landing page renders and offers sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mietwerk" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Anmelden" })).toBeVisible();
});
