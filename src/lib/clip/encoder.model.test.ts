import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { CatalogItem } from "@/lib/indexing/catalog";
import { CATALOG_FILE, IMAGES_DIR } from "@/lib/indexing/paths";

import { CLIP_DIMENSIONS } from "./config";
import { embedImages, embedTexts, readImageFile } from "./node";
import { dot } from "./vector";

// Local only (`npm run test:model`): downloads the CLIP model (153.6 MB) on the
// first run and needs `npm run index:prepare`. CI never runs this project.

function findProduct(match: (item: CatalogItem) => boolean): CatalogItem {
  const lines = readFileSync(CATALOG_FILE, "utf8").trim().split("\n");
  const item = lines.map((line) => JSON.parse(line) as CatalogItem).find(match);
  if (!item) throw new Error("No matching product in the catalog");
  return item;
}

describe("CLIP encoder (real model)", () => {
  test("text and image vectors share one space", async () => {
    const dress = findProduct(
      (item) => item.articleType === "Dresses" && item.baseColour === "Red",
    );
    const shoe = findProduct(
      (item) =>
        item.articleType === "Casual Shoes" && item.baseColour === "Black",
    );

    const images = await Promise.all(
      [dress, shoe].map((item) =>
        readImageFile(join(IMAGES_DIR, `${item.id}.jpg`)),
      ),
    );
    const [dressVector, shoeVector] = await embedImages(images);
    const [redDress, blackShoes] = await embedTexts([
      "a red dress",
      "black casual shoes",
    ]);

    for (const vector of [dressVector, shoeVector, redDress, blackShoes]) {
      expect(vector).toHaveLength(CLIP_DIMENSIONS);
      expect(dot(vector, vector)).toBeCloseTo(1, 4);
    }
    expect(dot(redDress, dressVector)).toBeGreaterThan(
      dot(redDress, shoeVector),
    );
    expect(dot(blackShoes, shoeVector)).toBeGreaterThan(
      dot(blackShoes, dressVector),
    );
  });
});
