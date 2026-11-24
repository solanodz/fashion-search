import { expect, test } from "@playwright/test";

// Stub encoder build (NEXT_PUBLIC_CLIP_STUB=1) with mocked APIs.

const product = (id: number, name: string, baseColour: string) => ({
  id,
  score: 0.3,
  product: { id, name, articleType: "Dresses", baseColour },
});
const catalog = [
  product(101, "Red Dress", "Red"),
  product(102, "Black Dress", "Black"),
  product(103, "Maroon Dress", "Maroon"),
  product(104, "Green Dress", "Green"),
];

// 1×1 white JPEG.
const pixel = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

type Body = {
  feedback?: { like: number[]; dislike: number[] };
};
let requests: Body[];

test.beforeEach(async ({ page }) => {
  requests = [];
  await page.route("**/images/*", (route) =>
    route.fulfill({ contentType: "image/jpeg", body: pixel }),
  );
  await page.route("**/api/search", async (route) => {
    const body = route.request().postDataJSON() as Body;
    requests.push(body);
    const marked = [
      ...(body.feedback?.like ?? []),
      ...(body.feedback?.dislike ?? []),
    ];
    await route.fulfill({
      json: {
        // The server leaves the marked products out and says what it read.
        results: catalog.filter((result) => !marked.includes(result.id)),
        ...(body.feedback
          ? {
              leaning: {
                prefer: body.feedback.like.length
                  ? { articleType: "Dresses", baseColour: "Red" }
                  : {},
                avoid:
                  body.feedback.like.length && body.feedback.dislike.length
                    ? { baseColour: ["Black"] }
                    : {},
              },
            }
          : {}),
      },
    });
  });
});

test("liking and disliking results refines the search, and marks can be undone", async ({
  page,
}) => {
  await page.goto("/?q=dresses");
  await expect(page.getByText("4 closest matches for “dresses”")).toBeVisible();
  expect(requests.at(-1)?.feedback).toBeUndefined();

  await page
    .getByRole("button", { name: "Like Red Dress", exact: true })
    .click();
  const marks = page.getByRole("region", { name: "Your marks" });
  await expect(
    marks.getByText("First, what your likes share: dresses, red."),
  ).toBeVisible();
  expect(requests.at(-1)?.feedback).toEqual({ like: [101], dislike: [] });
  // The liked product moves from the results to the marks.
  await expect(
    page.getByRole("button", { name: "Like Red Dress", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\?q=dresses&up=101$/);

  await page
    .getByRole("button", { name: "Dislike Black Dress", exact: true })
    .click();
  await expect(marks.getByText("Last: black.")).toBeVisible();
  expect(requests.at(-1)?.feedback).toEqual({ like: [101], dislike: [102] });
  await expect(page).toHaveURL(/\?q=dresses&up=101&down=102$/);

  // Removing one mark keeps the other.
  await marks
    .getByRole("button", { name: "Remove the like on Red Dress" })
    .click();
  await expect(
    marks.getByText("Moved away from the look of what you disliked."),
  ).toBeVisible();
  expect(requests.at(-1)?.feedback).toEqual({ like: [], dislike: [102] });
  await expect(
    page.getByRole("button", { name: "Like Red Dress", exact: true }),
  ).toBeVisible();

  await marks.getByRole("button", { name: "Clear marks" }).click();
  await expect(marks).toHaveCount(0);
  expect(requests.at(-1)?.feedback).toBeUndefined();
  await expect(page).toHaveURL(/\?q=dresses$/);
});

test("a shared URL restores the marks, and a new search drops them", async ({
  page,
}) => {
  await page.goto("/?q=dresses&up=101&down=102");
  const marks = page.getByRole("region", { name: "Your marks" });
  await expect(marks.getByText("Last: black.")).toBeVisible();
  expect(requests[0].feedback).toEqual({ like: [101], dislike: [102] });
  // Names aren't in the URL, so the marks are named by id.
  await expect(
    marks.getByRole("button", { name: "Remove the dislike on product 102" }),
  ).toBeVisible();

  const input = page.getByRole("textbox", {
    name: "Describe what you are looking for",
  });
  await input.fill("red shoes");
  await input.press("Enter");
  await expect(page.getByText("closest matches for “red shoes”")).toBeVisible();
  await expect(marks).toHaveCount(0);
  expect(requests.at(-1)?.feedback).toBeUndefined();
  await expect(page).toHaveURL(/\?q=red\+shoes$/);
});
