# 0014. Shopping assistant: a language model plans the searches

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

Some requests are not one query. "An outfit for a summer wedding, for a man,
nothing black" is several products (shirt, trousers, shoes, belt), an occasion
and a constraint. The search box takes one query at a time, and CLIP does not
read negation: typed into the normal search, "formal shirt for men, nothing
black" returns 6 black shirts in the top 12, while "formal shirt for men"
returns none. The outfit search (ADR 0013) already uses a small language
model for a narrow job, describing garments.

## Options considered

1. **Encode the whole request with CLIP:** nothing new to build, but one
   vector can't stand for four kinds of product, and "nothing black" pulls
   the results towards black.
2. **Rules and a glossary**, as for Spanish (ADR 0011): local and free, but
   rules can't turn "a summer wedding" into the pieces of an outfit.
3. **Let a language model answer with products** (retrieve, then generate, or
   a tool-calling loop): the most flexible, but slower and costlier (several
   model calls, the results in the prompt), and the answer depends on how the
   model reads a list it can also misquote.
4. **Let a language model plan, and the search engine search:** one model
   call that returns structured data; retrieval stays deterministic, cheap and
   inspectable, and the model can't invent a product because it never names
   one.

## Decision

Option 4. `/assistant` sends the request (at most 300 characters) to
`/api/plan`, which calls OpenAI's cheapest model (`gpt-6-luna`, the same as
ADR 0013) with a strict JSON schema (`src/lib/assistant/plan.ts`):

- `summary`: what it understood, in the shopper's language.
- `gender`: Men, Women, Boys, Girls or none.
- up to five `searches`, each with a `title` in the shopper's language, a
  `query` in English catalog words ("light blue linen formal shirt"), an
  `articleType` out of the 58 types that cover 96% of the catalog, and the
  `avoidColours` out of the 24 most common colours.

The page shows the plan as it is, and runs each search through `/api/search`
like any other: the query's CLIP text vector and keyword vector (ADR 0009),
filters for gender and type, and a new exclusion filter for the colours to
avoid (`exclude.baseColour`, a `must_not` in Qdrant). A request that isn't
about shopping gets a summary and no searches.

The catalog is uneven: 477 products for girls, and most backpacks and many
watches are unisex. A search that finds fewer than three products is run
again without the gender, then without the type, and the row says so.
Colours to avoid are never dropped.

The key stays on the server, requests are rate-limited per IP, and responses
are not stored (`store: false`). Without `OPENAI_API_KEY` the route answers
501 and the page offers the plain search instead.

## Consequences

- A request in Spanish or English becomes three to five rows of products in
  3–5 s (the plan) plus under 1 s (the searches). Each plan costs a fraction
  of a cent.
- The request leaves the browser for OpenAI; the page says so. Everything
  else works as before: only vectors and filters reach the search.
- The model only knows the catalog through the lists in the schema. It can
  ask for a type the catalog barely has for that gender; relaxing the filters
  covers it, at the cost of less exact rows.
- Not measured: there is no test set for plans yet. The four examples on the
  page were checked by hand. A set of requests with expected types and
  exclusions would make changes to the prompt measurable.
- `/api/search` accepts `exclude`, which other pages can use.
