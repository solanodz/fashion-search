# 0004. Use Qdrant as the vector database

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

We need nearest-neighbor search over ~44,000 CLIP vectors (512 dimensions)
combined with exact filters on gender, category and color.

## Options considered

1. **Postgres + pgvector:** familiar, but filtered vector search needs more
   tuning.
2. **Managed proprietary services:** no local equivalent for development.
3. **Qdrant:** open source, payload filtering built into the vector index,
   the same Docker image locally and in CI, and a free Qdrant Cloud tier.

## Decision

Qdrant. Docker Compose locally, a service container in CI, and a free Qdrant
Cloud cluster in production. The app uses a read-only API key; only the local
indexing script writes.

## Consequences

Development, CI and production run the same engine version (pinned in
`docker-compose.yml` and `ci.yml`, kept in sync by hand). The free tier
limits size and may pause idle clusters, which is acceptable for a portfolio
project.
