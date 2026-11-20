import { z } from "zod";

import { serverEnv } from "@/env";
import { qdrant } from "@/lib/qdrant";
import { searchRequestSchema, type SearchResponse } from "@/lib/search/schema";
import { runSearchWithLists } from "@/lib/search/search";

/**
 * Vector search. The browser encodes the query with CLIP and sends only the
 * vector plus filters; this handler never runs the model.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = searchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const output = await runSearchWithLists(
      qdrant(),
      serverEnv().QDRANT_COLLECTION,
      parsed.data,
    );
    return Response.json(output satisfies SearchResponse);
  } catch (error) {
    console.error("Search failed", error);
    return Response.json(
      { error: "Search is unavailable right now. Try again in a moment." },
      { status: 503 },
    );
  }
}
