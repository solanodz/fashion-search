import { expect, test } from "@playwright/test";

test("the guide explains usage and the search pipeline", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);

  await expect(
    page.getByRole("heading", { level: 1, name: "How fashion-search works" }),
  ).toBeVisible();
  for (const section of [
    "Using it",
    "Behind a search",
    "Reading the screen",
    "Why it's built this way",
  ]) {
    await expect(
      page.getByRole("heading", { level: 2, name: section }),
    ).toBeVisible();
  }
  // Each usage step has an illustrated figure described by its caption.
  await expect(page.getByRole("img", { name: /^A text search/ })).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^An embedding drawn as a strip/ }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Try a search" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});
