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
  await page.getByText("a red dress", { exact: true }).click();
  await expect(page.getByText("Expected: Dresses, Red")).toBeVisible();
});
