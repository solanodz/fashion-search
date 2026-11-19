import { expect, test } from "@playwright/test";

// Stub encoder (NEXT_PUBLIC_CLIP_STUB=1): text → unit vector on axis 0,
// photo → unit vector on axis 1. That makes the combined vector checkable.

const results = [
  {
    id: 201,
    score: 0.3,
    product: {
      id: 201,
      name: "Alma Women Blue Kurta",
      articleType: "Kurtas",
      baseColour: "Blue",
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

test("a photo plus text searches for 'this, but in blue'", async ({ page }) => {
  const vectors: number[][] = [];
  const bodies: { parts?: { name: string; vector: number[] }[] }[] = [];
  await page.route("**/api/search", async (route) => {
    const body = route.request().postDataJSON();
    vectors.push(body.vector);
    bodies.push(body);
    // The server scores each part of a combined query separately.
    const parts = body.parts ? { photo: 0.9, text: 0.27 } : undefined;
    await route.fulfill({
      json: { results: results.map((r) => ({ ...r, parts })) },
    });
  });

  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "dress.jpg",
    mimeType: "image/jpeg",
    buffer: pixel,
  });

  await expect(
    page.getByRole("img", { name: "Search photo: your photo" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 closest matches for your photo"),
  ).toBeVisible();
  expect(vectors[0].slice(0, 2)).toEqual([0, 1]);
  expect(bodies[0].parts).toBeUndefined();

  const refinement = page.getByRole("textbox", {
    name: "Describe how it should differ from the photo",
  });
  await refinement.fill("in blue");
  await refinement.press("Enter");

  await expect(
    page.getByText("1 closest matches for your photo + “in blue”"),
  ).toBeVisible();
  // Text weighs twice the photo: normalize([2, 1]).
  expect(vectors[1][0]).toBeCloseTo(2 / Math.sqrt(5), 5);
  expect(vectors[1][1]).toBeCloseTo(1 / Math.sqrt(5), 5);

  // The photo and text vectors go along, and each result shows both scores.
  expect(bodies[1].parts?.map((p) => [p.name, p.vector.slice(0, 2)])).toEqual([
    ["photo", [0, 1]],
    ["text", [1, 0]],
  ]);
  await expect(page.getByText("photo 0.900 · text 0.270")).toBeVisible();
});

test("'More like this' searches with a product's photo, and the photo can be removed", async ({
  page,
}) => {
  await page.route("**/api/search", (route) =>
    route.fulfill({ json: { results } }),
  );
  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Describe what you are looking for",
  });
  await input.fill("blue kurta");
  await input.press("Enter");

  await page.getByRole("button", { name: "More like this" }).click();
  await expect(
    page.getByText("1 closest matches for “Alma Women Blue Kurta”"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByRole("img", { name: /Search photo/ })).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Describe what you are looking for" }),
  ).toBeFocused();
});

test("non-image files are rejected with an explanation", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "That file is not an image. Use a JPEG, PNG or WebP photo.",
  );
});
