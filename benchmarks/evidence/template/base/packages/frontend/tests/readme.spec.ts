import { expect, test } from "@playwright/test";

test("captures the scaffold landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  await page.screenshot({
    path: "test-results/readme-scaffold.png",
    fullPage: true,
  });
});
