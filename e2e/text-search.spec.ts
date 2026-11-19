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
  let request: { vector: number[]; limit: number } | undefined;
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

  // Each result shows its cosine similarity to the query.
  await expect(page.getByText("0.310", { exact: true })).toBeVisible();
  await expect(page.getByText("0.300", { exact: true })).toBeVisible();

  // The pipeline shows what the search did.
  const pipeline = page.getByRole("region", { name: "How it works" });
  await expect(pipeline.getByText("“white running shoes”")).toBeVisible();
  await expect(pipeline.getByText("Text encoder")).toBeVisible();
  await expect(
    pipeline.getByRole("img", { name: "Query vector, 512 dimensions" }),
  ).toBeVisible();
  await expect(pipeline.getByText(/^Top 2 of /)).toBeVisible();
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
