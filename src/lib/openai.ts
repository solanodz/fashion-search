/**
 * The two things every OpenAI call here needs: sending a Responses API
 * request with the server's key, and reading the text out of the reply.
 * The key never leaves the server; callers are route handlers.
 */

const RESPONSES_URL = "https://api.openai.com/v1/responses";

/** Sends a Responses API request and returns the reply, or throws. */
export async function createResponse(
  apiKey: string,
  body: unknown,
  { timeoutMs = 20_000 }: { timeoutMs?: number } = {},
): Promise<unknown> {
  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const reply: unknown = await response.json();
  if (!response.ok) {
    console.error("OpenAI request failed", response.status, reply);
    throw new Error(`OpenAI answered ${response.status}`);
  }
  return reply;
}

/** The first output text in a Responses API reply, or null. */
export function outputText(reply: unknown): string | null {
  const output = (reply as { output?: unknown[] })?.output ?? [];
  return (
    output
      .flatMap(
        (item) =>
          (item as { content?: { type: string; text?: string }[] }).content ??
          [],
      )
      .find((part) => part.type === "output_text")?.text ?? null
  );
}
