import { expect, test } from "@playwright/test";

test("home page loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // The E2E build has no Qdrant, so the API answers 503; that's not a page error.
    if (message.location().url.includes("/api/")) return;
    if (message.type() === "error") errors.push(message.text());
  });

  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The embedding map loads its points from public/.
  await expect(
    page.getByRole("img", {
      name: /^Map of [\d,]+ products by image similarity$/,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
