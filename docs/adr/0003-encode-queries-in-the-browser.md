# 0003. Encode queries in the browser with CLIP

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Search accepts text, a photo, or both. Queries must be embedded in the same
vector space as the catalog. The project should run for free: no GPU server
and no paid model APIs.

## Options considered

1. **Hosted embedding API:** simple, but costs money per query and needs API
   keys.
2. **Server-side model** in a serverless function: cold starts with a
   ~150 MB model and tight memory limits.
3. **Client-side model** with Transformers.js: the visitor's browser
   downloads the quantized model once and encodes queries locally.

## Decision

Use `Xenova/clip-vit-base-patch32` (MIT) through Transformers.js in the
browser. The same model, run offline, embeds the catalog at indexing time.
The server receives only a vector plus filters and queries Qdrant.

## Consequences

- No inference cost and no model keys; uploaded photos never leave the
  visitor's device.
- First search waits for the model download (~150 MB, cached afterwards). The
  UI must show progress and work on slow connections.
- Tests must not depend on the model: they use precomputed vectors or a stub
  encoder.
