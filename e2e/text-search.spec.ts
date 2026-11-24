import { expect, test } from "@playwright/test";

// Runs against a build with NEXT_PUBLIC_CLIP_STUB=1 (no model download) and a
// mocked /api/search, so it needs neither the CLIP model nor Qdrant.

const results = [
  {
    id: 101,
    score: 0.31,
    product: {
      id: 101,
      name: "Puma Men White Running Shoes",
      articleType: "Sports Shoes",
      baseColour: "White",
    },
  },
  {
    id: 102,
    score: 0.3,
    product: {
      id: 102,
      name: "Nike Women White Sneakers",
      articleType: "Casual Shoes",
      baseColour: "White",
    },
  },
];

// 1×1 white JPEG.
const pixel = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.route("**/images/*", (route) =>
    route.fulfill({ contentType: "image/jpeg", body: pixel }),
  );
});

test("searching by text shows matching products", async ({ page }) => {
  let request:
    | {
        vector: number[];
        limit: number;
        keywords?: { indices: number[]; values: number[] };
      }
    | undefined;
  await page.route("**/api/search", async (route) => {
    request = route.request().postDataJSON();
    await route.fulfill({ json: { results } });
  });

  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Describe what you are looking for",
  });
  await input.fill("white running shoes");
  await input.press("Enter");

  await expect(
    page.getByText("2 closest matches for “white running shoes”"),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Puma Men White Running Shoes" }),
  ).toBeVisible();
  await expect(page.getByText("Casual Shoes, white")).toBeVisible();
  expect(request?.vector).toHaveLength(512);
  // Hybrid search: the query's words go as hashed keywords, not as text.
  expect(request?.keywords?.values).toEqual([1, 1, 1]);
  expect(JSON.stringify(request)).not.toContain("running");

  // Results show the product, not the similarity scores.
  await expect(page.getByText("0.310", { exact: true })).toHaveCount(0);
});

test("a suggestion runs a search", async ({ page }) => {
  await page.route("**/api/search", (route) =>
    route.fulfill({ json: { results } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "gold earrings" }).click();
  await expect(
    page.getByRole("textbox", { name: "Describe what you are looking for" }),
  ).toHaveValue("gold earrings");
  await expect(
    page.getByText("2 closest matches for “gold earrings”"),
  ).toBeVisible();
});

test("a failing search explains what happened", async ({ page }) => {
  await page.route("**/api/search", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: "Search is unavailable right now. Try again in a moment.",
      },
    }),
  );
  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Describe what you are looking for",
  });
  await input.fill("red dress");
  await input.press("Enter");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Search is unavailable right now. Try again in a moment.",
  );
});

test("a Spanish search is read in English first", async ({ page }) => {
  let keywords: number[] = [];
  await page.route("**/api/search", async (route) => {
    keywords = route.request().postDataJSON().keywords?.indices ?? [];
    await route.fulfill({ json: { results } });
  });
  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Describe what you are looking for",
  });
  await input.fill("remera blanca para hombre");
  await input.press("Enter");

  await expect(
    page.getByText(
      "2 closest matches for “remera blanca para hombre” (read as “white t-shirt for men”)",
    ),
  ).toBeVisible();
  // The keywords are the English words: white, tshirt, men.
  expect(keywords).toHaveLength(3);
});
