import { expect, test } from "@playwright/test";

// Stub encoder (NEXT_PUBLIC_CLIP_STUB=1): the photo yields a top and a
// bottom, each with a fixed vector and a CLIP reading of "Blue <garment>".

const product = (id: number, name: string, articleType: string) => ({
  id,
  score: 0.5,
  product: { id, name, articleType, baseColour: "Blue" },
});

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

test("each garment in the photo gets its own search, steered by the description", async ({
  page,
}) => {
  const searches: { filters: Record<string, string>; keywords?: unknown }[] =
    [];
  await page.route("**/api/describe", (route) =>
    route.fulfill({
      json: {
        gender: "Women",
        garments: [
          {
            slot: "top",
            articleType: "Jackets",
            colour: "Maroon",
            description: "maroon checked long coat",
          },
          {
            slot: "shoes",
            articleType: "Casual Shoes",
            colour: "Brown",
            description: "brown suede ankle boots",
          },
        ],
      },
    }),
  );
  await page.route("**/api/search", async (route) => {
    const body = route.request().postDataJSON();
    searches.push(body);
    const type = body.filters.articleType ?? body.filters.subCategory;
    await route.fulfill({
      json: { results: [product(searches.length, `A ${type}`, type)] },
    });
  });

  await page.goto("/outfit");
  await page.getByLabel("Photo of a person").setInputFiles({
    name: "look.jpg",
    mimeType: "image/jpeg",
    buffer: pixel,
  });

  const matches = page.getByRole("region", { name: "Matches" });
  await expect(matches.getByText("3 garments")).toBeVisible();
  // The top: found in the photo and described.
  await expect(matches.getByText("maroon checked long coat")).toBeVisible();
  // The bottom: found but not described, so CLIP's reading is used.
  await expect(matches.getByText("Blue bottom")).toBeVisible();
  // The shoes: only described, searched by text alone.
  await expect(matches.getByText("Described, not cropped")).toBeVisible();

  const filters = searches.map((s) => s.filters);
  expect(filters).toContainEqual({
    subCategory: "Topwear",
    articleType: "Jackets",
    gender: "Women",
  });
  expect(filters).toContainEqual({
    subCategory: "Bottomwear",
    gender: "Women",
  });
  expect(searches.every((s) => s.keywords)).toBe(true);
});

test("without a description service, CLIP reads each garment", async ({
  page,
}) => {
  await page.route("**/api/describe", (route) =>
    route.fulfill({ status: 501, json: { error: "Not set up." } }),
  );
  await page.route("**/api/search", (route) =>
    route.fulfill({ json: { results: [product(1, "A top", "Tops")] } }),
  );

  await page.goto("/outfit");
  await page.getByLabel("Photo of a person").setInputFiles({
    name: "look.jpg",
    mimeType: "image/jpeg",
    buffer: pixel,
  });

  const matches = page.getByRole("region", { name: "Matches" });
  await expect(matches.getByText(/aren't set up here/)).toBeVisible();
  await expect(matches.getByText("Blue top")).toBeVisible();
});

test("with the AI switched off, nothing is sent for a description", async ({
  page,
}) => {
  let described = false;
  await page.route("**/api/describe", (route) => {
    described = true;
    return route.fulfill({ status: 501, json: {} });
  });
  await page.route("**/api/search", (route) =>
    route.fulfill({ json: { results: [] } }),
  );

  await page.goto("/outfit");
  await page.getByRole("checkbox", { name: /Describe with AI/ }).uncheck();
  await page.getByLabel("Photo of a person").setInputFiles({
    name: "look.jpg",
    mimeType: "image/jpeg",
    buffer: pixel,
  });

  await expect(page.getByText("2 garments")).toBeVisible();
  expect(described).toBe(false);
});
