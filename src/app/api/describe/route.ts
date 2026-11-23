import { z } from "zod";

import { serverEnv } from "@/env";
import { createResponse } from "@/lib/openai";
import {
  describeBodySchema,
  describeRequest,
  type OutfitDescription,
  parseDescribeResponse,
} from "@/lib/outfit/describe";
import { createRateLimit } from "@/lib/rate-limit";

/**
 * Describes the outfit in a photo with a small vision language model
 * (ADR 0013). Optional: without OPENAI_API_KEY it answers 501 and the outfit
 * search relies on CLIP alone. The photo is sent to OpenAI and not stored
 * (store: false); nothing is kept here.
 */

const allow = createRateLimit({ limit: 8, windowMs: 60_000 });

export async function POST(request: Request) {
  const { OPENAI_API_KEY, OPENAI_MODEL } = serverEnv();
  if (!OPENAI_API_KEY) {
    return Response.json(
      { error: "Outfit descriptions are not set up on this server." },
      { status: 501 },
    );
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(ip)) {
    return Response.json(
      { error: "Too many descriptions in a minute. Try again shortly." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }
  const parsed = describeBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const reply = await createResponse(
      OPENAI_API_KEY,
      describeRequest(OPENAI_MODEL, parsed.data.image),
    );
    return Response.json(
      parseDescribeResponse(reply) satisfies OutfitDescription,
    );
  } catch (error) {
    console.error("Describe failed", error);
    return Response.json(
      { error: "Couldn't describe the outfit right now." },
      { status: 503 },
    );
  }
}
