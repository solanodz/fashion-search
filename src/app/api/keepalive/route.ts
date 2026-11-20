import { serverEnv } from "@/env";
import { isAuthorized, probeVector } from "@/lib/keepalive";
import { qdrant } from "@/lib/qdrant";
import { IMAGE_VECTOR } from "@/lib/search/query";

/**
 * Called daily by Vercel Cron (vercel.json) so the free Qdrant Cloud cluster
 * is used at least once a week and isn't suspended (ADR 0012). Runs a real
 * search and a count with the app's read-only key.
 */
export async function GET(request: Request) {
  const { CRON_SECRET, QDRANT_COLLECTION } = serverEnv();
  // Reading the header also keeps this handler dynamic, never prerendered.
  if (!isAuthorized(request.headers.get("authorization"), CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const client = qdrant();
    const [search, { count }] = await Promise.all([
      client.query(QDRANT_COLLECTION, {
        query: probeVector(),
        using: IMAGE_VECTOR,
        limit: 1,
      }),
      client.count(QDRANT_COLLECTION, { exact: false }),
    ]);
    return Response.json({
      ok: true,
      points: count,
      found: search.points.length,
      ms: Date.now() - started,
    });
  } catch (error) {
    console.error("Keepalive failed", error);
    return Response.json(
      { ok: false, error: "Qdrant is unavailable." },
      { status: 503 },
    );
  }
}
