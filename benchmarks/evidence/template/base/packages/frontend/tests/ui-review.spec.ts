import { expect, test } from "@playwright/test";

test("the scaffold remains readable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator(".panel")).toBeInViewport();
});

test("the scaffold remains readable at tablet width", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator(".panel")).toBeInViewport();
});

test("the scaffold remains readable at desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator(".panel")).toBeInViewport();
});
