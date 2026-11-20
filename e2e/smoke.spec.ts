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
      name: /^3D map of [\d,]+ products by image similarity$/,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("the embedding map opens large, searches and closes", async ({ page }) => {
  await page.route("**/api/search", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Expand" }).click();

  const dialog = page.getByRole("dialog", { name: "Embedding space" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("img", { name: /^3D map of [\d,]+ products/ }),
  ).toBeVisible();

  const search = dialog.getByRole("textbox", {
    name: "Search and show the results on the map",
  });
  await search.fill("gold earrings");
  await search.press("Enter");
  await expect(
    dialog.getByText("0 closest matches for “gold earrings”"),
  ).toBeVisible();
  // The main search follows the map's search.
  await expect(page).toHaveURL(/\?q=gold\+earrings$/);

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});
