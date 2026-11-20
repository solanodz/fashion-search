import { expect, test } from "@playwright/test";

test("the evaluation page shows every version and each search", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Evaluation" }).click();
  await expect(page).toHaveURL(/\/evaluation$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Evaluation" }),
  ).toBeVisible();

  for (const version of [
    "60×80 thumbnails",
    "384×512 photos",
    "Hybrid search",
    "Spanish with glossary",
  ]) {
    await expect(
      page.getByRole("listitem").filter({ hasText: version }).first(),
    ).toBeVisible();
  }

  // Opening a search shows what each version returned.
  const table = page.locator("summary");
  await table.getByText("a red dress", { exact: true }).click();
  await expect(page.getByText("Expected: Dresses, Red")).toBeVisible();

  // Only the first searches show until asked for.
  const lastSearch = table.getByText("blue tie", { exact: true });
  await expect(lastSearch).toBeHidden();
  await page.getByText("Show all 27 searches").click();
  await expect(lastSearch).toBeVisible();

  // The charts summarise the two big changes.
  await expect(
    page.getByRole("img", { name: /^English: image only → hybrid search/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^Spanish: as typed → with the glossary/ }),
  ).toBeVisible();
});
