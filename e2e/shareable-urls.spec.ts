import { expect, test } from "@playwright/test";

// Stub encoder build (NEXT_PUBLIC_CLIP_STUB=1) with mocked APIs.

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
];

// 1×1 white JPEG.
const pixel = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

let requests: { filters: Record<string, string> }[];

test.beforeEach(async ({ page }) => {
  requests = [];
  await page.route("**/images/*", (route) =>
    route.fulfill({ contentType: "image/jpeg", body: pixel }),
  );
  await page.route("**/api/search", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { results } });
  });
});

test("a shared URL reproduces the search and its filters", async ({ page }) => {
  await page.goto("/?q=white+running+shoes&colour=White");

  await expect(
    page.getByText("1 closest matches for “white running shoes” in White"),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Describe what you are looking for" }),
  ).toHaveValue("white running shoes");
  expect(requests[0].filters).toEqual({ baseColour: "White" });
});

test("searches are added to the history", async ({ page }) => {
  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Describe what you are looking for",
  });
  await input.fill("gold earrings");
  await input.press("Enter");
  await expect(page).toHaveURL(/\?q=gold\+earrings$/);

  await input.fill("blue jeans");
  await input.press("Enter");
  await expect(page).toHaveURL(/\?q=blue\+jeans$/);

  await page.goBack();
  await expect(input).toHaveValue("gold earrings");
  await expect(
    page.getByText("1 closest matches for “gold earrings”"),
  ).toBeVisible();
});

test("'More like this' can be shared by product id", async ({ page }) => {
  await page.goto("/?q=shoes");
  await page.getByRole("button", { name: "More like this" }).click();
  await expect(page).toHaveURL(/\?like=101$/);

  await page.goto("/?like=101");
  await expect(
    page.getByRole("img", { name: "Search photo: product 101" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 closest matches for product 101"),
  ).toBeVisible();
});
