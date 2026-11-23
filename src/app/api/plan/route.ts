import { z } from "zod";

import { serverEnv } from "@/env";
import {
  parsePlanResponse,
  planBodySchema,
  planRequest,
  type ShoppingPlan,
} from "@/lib/assistant/plan";
import { createResponse } from "@/lib/openai";
import { createRateLimit } from "@/lib/rate-limit";

/**
 * Plans the searches for a shopping request with a small language model
 * (ADR 0014). Optional: without OPENAI_API_KEY it answers 501 and the
 * assistant page says so. The request is sent to OpenAI and not stored
 * (store: false); nothing is kept here.
 */

const allow = createRateLimit({ limit: 8, windowMs: 60_000 });

export async function POST(request: Request) {
  const { OPENAI_API_KEY, OPENAI_MODEL } = serverEnv();
  if (!OPENAI_API_KEY) {
    return Response.json(
      { error: "The shopping assistant is not set up on this server." },
      { status: 501 },
    );
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(ip)) {
    return Response.json(
      { error: "Too many requests in a minute. Try again shortly." },
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
  const parsed = planBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const reply = await createResponse(
      OPENAI_API_KEY,
      planRequest(OPENAI_MODEL, parsed.data.request),
    );
    return Response.json(parsePlanResponse(reply) satisfies ShoppingPlan);
  } catch (error) {
    console.error("Plan failed", error);
    return Response.json(
      { error: "Couldn't plan that request right now." },
      { status: 503 },
    );
  }
}
