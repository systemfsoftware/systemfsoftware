import { expect, test, type Page } from "@playwright/test";

/** Navigates to the generated application's root page. */
export async function journey_scaffold_loads(page: Page): Promise<void> {
  const response = await page.goto("/");
  if (response === null) throw new Error("Navigation returned no response.");
  if (response.ok() === false)
    throw new Error(`Navigation failed with status ${response.status()}.`);
}

test("the production scaffold loads", async ({ page }) => {
  await journey_scaffold_loads(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "{{name}}",
  );
});
