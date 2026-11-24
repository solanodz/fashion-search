import { expect, test } from "@playwright/test";

// Stub encoder (NEXT_PUBLIC_CLIP_STUB=1): every text becomes a fixed vector.

const product = (id: number, name: string) => ({
  id,
  score: 0.3,
  product: { id, name, articleType: "Shirts", baseColour: "Blue" },
});

// 1×1 white JPEG.
const pixel = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

const weddingPlan = {
  summary: "Outfit de hombre para una boda de verano, sin negro.",
  gender: "Men",
  searches: [
    {
      title: "Camisa",
      query: "light blue linen formal shirt",
      articleType: "Shirts",
      avoidColours: ["Black"],
    },
    {
      title: "Zapatos",
      query: "brown leather formal shoes",
      articleType: "Formal Shoes",
      avoidColours: ["Black"],
    },
  ],
};

type SearchBody = {
  filters: Record<string, string>;
  exclude?: { baseColour: string[] };
  keywords?: unknown;
};

test.beforeEach(async ({ page }) => {
  await page.route("**/images/*", (route) =>
    route.fulfill({ contentType: "image/jpeg", body: pixel }),
  );
});

test("a request becomes a plan, and each planned search runs with its filters", async ({
  page,
}) => {
  const requests: string[] = [];
  const searches: SearchBody[] = [];
  await page.route("**/api/plan", async (route) => {
    requests.push(route.request().postDataJSON().request);
    await route.fulfill({ json: weddingPlan });
  });
  await page.route("**/api/search", async (route) => {
    const body = route.request().postDataJSON() as SearchBody;
    searches.push(body);
    await route.fulfill({
      json: {
        results: [1, 2, 3].map((n) =>
          product(searches.length * 10 + n, `A ${body.filters.articleType}`),
        ),
      },
    });
  });

  await page.goto("/");
  await page.getByRole("link", { name: "Assistant" }).click();
  await page
    .getByLabel("What are you shopping for?")
    .fill("outfit para una boda de verano, hombre, nada de negro");
  await page.getByRole("button", { name: "Plan it" }).click();

  const plan = page.getByRole("region", { name: "Plan" });
  await expect(plan.getByText(weddingPlan.summary)).toBeVisible();
  await expect(plan.getByText("2 searches")).toBeVisible();
  // Each row shows what the model planned: the text and the filters.
  await expect(plan.getByRole("heading", { name: "Camisa" })).toBeVisible();
  await expect(plan.getByText("light blue linen formal shirt")).toBeVisible();
  await expect(plan.getByText("Shirts · Men · no black")).toBeVisible();
  await expect(plan.getByText("Formal Shoes · Men · no black")).toBeVisible();
  await expect(plan.getByRole("link", { name: /A Shirts/ })).toHaveCount(3);

  expect(requests).toEqual([
    "outfit para una boda de verano, hombre, nada de negro",
  ]);
  expect(searches.map((s) => s.filters)).toEqual(
    expect.arrayContaining([
      { gender: "Men", articleType: "Shirts" },
      { gender: "Men", articleType: "Formal Shoes" },
    ]),
  );
  expect(searches.every((s) => s.exclude?.baseColour[0] === "Black")).toBe(
    true,
  );
  expect(searches.every((s) => s.keywords)).toBe(true);
  // The request is in the URL, so the plan can be shared.
  await expect(page).toHaveURL(/\/assistant\?q=outfit%20para/);
});

test("a search that finds almost nothing is tried again with fewer filters", async ({
  page,
}) => {
  await page.route("**/api/plan", (route) =>
    route.fulfill({
      json: {
        summary: "Back to school for a girl.",
        gender: "Girls",
        searches: [
          {
            title: "Backpack",
            query: "school backpack",
            articleType: "Backpacks",
            avoidColours: [],
          },
        ],
      },
    }),
  );
  await page.route("**/api/search", async (route) => {
    const { filters } = route.request().postDataJSON() as SearchBody;
    // The catalog has no backpacks for girls: they are unisex.
    await route.fulfill({
      json: {
        results: filters.gender
          ? []
          : [1, 2, 3].map((n) => product(n, "Unisex Backpack")),
      },
    });
  });

  // A shared link runs the request on load.
  await page.goto("/assistant?q=back%20to%20school%20for%20a%20girl");
  const plan = page.getByRole("region", { name: "Plan" });
  await expect(
    plan.getByText("Backpacks · few for girls, so any gender"),
  ).toBeVisible();
  await expect(plan.getByRole("link", { name: /Unisex Backpack/ })).toHaveCount(
    3,
  );
});

test("a request that isn't about shopping gets an answer and no searches", async ({
  page,
}) => {
  let searched = false;
  await page.route("**/api/plan", (route) =>
    route.fulfill({
      json: {
        summary: "That isn't something this catalog sells.",
        gender: null,
        searches: [],
      },
    }),
  );
  await page.route("**/api/search", (route) => {
    searched = true;
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto("/assistant");
  await page
    .getByLabel("What are you shopping for?")
    .fill("what is the capital of France?");
  await page.getByRole("button", { name: "Plan it" }).click();
  await expect(
    page.getByText("That isn't something this catalog sells."),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Plan" })).not.toContainText(
    "searches",
  );
  expect(searched).toBe(false);
});

test("without a language model on the server, it offers a plain search", async ({
  page,
}) => {
  await page.route("**/api/plan", (route) =>
    route.fulfill({ status: 501, json: { error: "not set up" } }),
  );
  await page.goto("/assistant");
  await page.getByLabel("What are you shopping for?").fill("a red dress");
  await page.getByRole("button", { name: "Plan it" }).click();
  await expect(
    page.getByText("The assistant isn't set up on this server."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "search for “a red dress”" }),
  ).toHaveAttribute("href", "/?q=a%20red%20dress");
});
