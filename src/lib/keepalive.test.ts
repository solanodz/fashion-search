import { describe, expect, it } from "vitest";

import { isAuthorized, probeVector } from "./keepalive";

describe("isAuthorized", () => {
  it("requires the bearer secret when one is configured", () => {
    expect(isAuthorized("Bearer s3cret-value", "s3cret-value")).toBe(true);
    expect(isAuthorized("Bearer wrong", "s3cret-value")).toBe(false);
    expect(isAuthorized(null, "s3cret-value")).toBe(false);
    expect(isAuthorized("s3cret-value", "s3cret-value")).toBe(false);
  });

  it("allows anyone when no secret is configured", () => {
    expect(isAuthorized(null, undefined)).toBe(true);
  });
});

it("probes with a 512-dimension unit vector", () => {
  const vector = probeVector();
  expect(vector).toHaveLength(512);
  expect(Math.hypot(...vector)).toBeCloseTo(1);
});
