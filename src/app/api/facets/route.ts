import { z } from "zod";

import { serverEnv } from "@/env";
import { qdrant } from "@/lib/qdrant";
import { type Facets, getFacets } from "@/lib/search/facets";
import { searchFiltersSchema } from "@/lib/search/schema";

/** GET /api/facets?gender=Women&baseColour=Red → values and counts for every filter. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = searchFiltersSchema.strict().safeParse(params);
  if (!parsed.success) {
    return Response.json(
      { error: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const facets = await getFacets(
      qdrant(),
      serverEnv().QDRANT_COLLECTION,
      parsed.data,
    );
    return Response.json({ facets } satisfies { facets: Facets });
  } catch (error) {
    console.error("Facets failed", error);
    return Response.json(
      { error: "Filters are unavailable right now." },
      { status: 503 },
    );
  }
}
