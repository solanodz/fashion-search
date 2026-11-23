import { expect, test } from "@playwright/test";

test("the use cases page lists what the demo solves, each with a search to try", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.getByRole("link", { name: "Use cases" }).click();
  await expect(page).toHaveURL(/\/use-cases$/);

  await expect(
    page.getByRole("heading", { level: 1, name: "Use cases" }),
  ).toBeVisible();
  for (const section of [
    "For shoppers",
    "Beyond fashion",
    "What it takes to adapt it",
  ]) {
    await expect(
      page.getByRole("heading", { level: 2, name: section }),
    ).toBeVisible();
  }
  for (const useCase of [
    "Find it by describing it",
    "Find it with a photo",
    "This one, but different",
    "Shop the look",
    "Shopping in plain language",
    "Alternatives and recommendations",
  ]) {
    await expect(
      page.getByRole("heading", { level: 3, name: useCase }),
    ).toBeVisible();
  }
  // Each use case is illustrated and links to a live search.
  await expect(
    page.getByRole("img", { name: /^A search for “white running shoes”/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "the black handbag, in blue" }),
  ).toHaveAttribute("href", "/?like=27745&q=in+blue");

  await page.getByRole("link", { name: "white running shoes" }).click();
  await expect(page).toHaveURL(/\/\?q=white\+running\+shoes$/);
  expect(errors).toEqual([]);
});
