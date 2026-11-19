import { describe, expect, test } from "vitest";

import type { CatalogItem } from "./catalog";
import { buildPoints, nextCollectionName, versionOf } from "./collection";

const item = (id: number) => ({ id, name: `Product ${id}` }) as CatalogItem;

describe("collection versions", () => {
  test("parses versions only for the given alias", () => {
    expect(versionOf("products_v3", "products")).toBe(3);
    expect(versionOf("products_v3_old", "products")).toBeNull();
    expect(versionOf("other_v1", "products")).toBeNull();
  });

  test("picks the next free version", () => {
    expect(nextCollectionName([], "products")).toBe("products_v1");
    expect(
      nextCollectionName(
        ["products_v1", "products_v7", "other_v9"],
        "products",
      ),
    ).toBe("products_v8");
  });
});

describe("buildPoints", () => {
  test("joins catalog rows with their vectors", () => {
    const points = buildPoints(
      [item(1), item(2)],
      [
        { id: 2, vector: new Float32Array([0, 1]) },
        { id: 1, vector: new Float32Array([1, 0]) },
      ],
    );
    expect(
      points.map((point) => [point.id, point.vector, point.payload.name]),
    ).toEqual([
      [1, [1, 0], "Product 1"],
      [2, [0, 1], "Product 2"],
    ]);
  });

  test("fails when a catalog item has no vector", () => {
    expect(() =>
      buildPoints(
        [item(1), item(2)],
        [{ id: 1, vector: new Float32Array([1]) }],
      ),
    ).toThrow(/1 catalog items have no vector \(first: 2\)/);
  });
});
