import { expect, type Page, test } from "@playwright/test";

const facets = {
  gender: [
    { value: "Women", count: 3 },
    { value: "Men", count: 1 },
  ],
  masterCategory: [{ value: "Apparel", count: 4 }],
  articleType: [
    { value: "Dresses", count: 2 },
    { value: "Tops", count: 1 },
  ],
  baseColour: [
    { value: "Red", count: 3 },
    { value: "Blue", count: 1 },
  ],
};

const results = [
  {
    id: 1,
    score: 0.3,
    product: {
      id: 1,
      name: "Femella Women Red Dress",
      articleType: "Dresses",
      baseColour: "Red",
    },
  },
];

async function mockApi(page: Page) {
  const searches: { filters: Record<string, string> }[] = [];
  await page.route("**/api/facets*", (route) =>
    route.fulfill({ json: { facets } }),
  );
  await page.route("**/api/search", async (route) => {
    searches.push(route.request().postDataJSON());
    await route.fulfill({ json: { results } });
  });
  await page.route("**/images/*", (route) => route.fulfill({ status: 404 }));
  return searches;
}

test("filters narrow the current search", async ({ page }) => {
  const searches = await mockApi(page);
  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Describe what you are looking for",
  });
  await input.fill("a red dress");
  await input.press("Enter");
  await expect(
    page.getByText("1 closest matches for “a red dress”"),
  ).toBeVisible();

  await page.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "Dresses" }).click();
  await expect(
    page.getByText("1 closest matches for “a red dress” in Dresses"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Red, 3 products" }).click();
  await expect(
    page.getByText("1 closest matches for “a red dress” in Dresses, Red"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Red, 3 products" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(searches.at(-1)?.filters).toEqual({
    articleType: "Dresses",
    baseColour: "Red",
  });

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByText("1 closest matches for “a red dress”", { exact: true }),
  ).toBeVisible();
  expect(searches.at(-1)?.filters).toEqual({});
});

test("colours without products are disabled", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Green, 0 products", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Blue, 1 product", exact: true }),
  ).toBeEnabled();
});
