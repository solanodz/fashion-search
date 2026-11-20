import { CLIP_DIMENSIONS } from "./clip/config.ts";

/**
 * Keeps the free Qdrant Cloud cluster in use (ADR 0012): Qdrant suspends
 * free clusters after a week without use, so Vercel Cron calls
 * /api/keepalive daily and it runs a real search.
 */

/**
 * Whether a request may run the keepalive. With CRON_SECRET set, Vercel
 * Cron sends it as `Authorization: Bearer <secret>`; without it, anyone
 * may call the endpoint, which is harmless (one small read).
 */
export function isAuthorized(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  return !secret || authorization === `Bearer ${secret}`;
}

/** A fixed unit vector for the keepalive search; any direction will do. */
export function probeVector(): number[] {
  const value = 1 / Math.sqrt(CLIP_DIMENSIONS);
  return Array.from({ length: CLIP_DIMENSIONS }, () => value);
}
