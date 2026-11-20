import { describe, expect, test } from "vitest";

import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  test("accepts local defaults and treats an empty API key as missing", () => {
    const env = parseServerEnv({
      QDRANT_URL: "http://localhost:6333",
      QDRANT_API_KEY: "",
    });
    expect(env).toEqual({
      QDRANT_URL: "http://localhost:6333",
      QDRANT_API_KEY: undefined,
      QDRANT_COLLECTION: "products",
      CRON_SECRET: undefined,
      OPENAI_API_KEY: undefined,
      OPENAI_MODEL: "gpt-6-luna",
    });
  });

  test("fails with a readable message when the URL is missing", () => {
    expect(() => parseServerEnv({})).toThrow(/QDRANT_URL/);
  });
});
