import "server-only";

import { z } from "zod";

import { DEFAULT_DESCRIBE_MODEL } from "@/lib/outfit/describe";

/**
 * Server-only environment variables, validated once at startup.
 * Never prefix these with NEXT_PUBLIC_: they must not reach the browser.
 */
const serverEnvSchema = z.object({
  QDRANT_URL: z.url(),
  // Empty string in local development means "no key".
  QDRANT_API_KEY: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  QDRANT_COLLECTION: z.string().min(1).default("products"),
  // Set in Vercel to make /api/keepalive accept only Vercel Cron's calls.
  CRON_SECRET: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  // Optional: enables outfit descriptions (ADR 0013). Empty means off.
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  OPENAI_MODEL: z
    .string()
    .optional()
    .transform((value) => value || DEFAULT_DESCRIBE_MODEL),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
