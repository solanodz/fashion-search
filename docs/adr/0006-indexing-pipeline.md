# 0006. Local, staged indexing pipeline

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The catalog (44,072 products) must be turned into CLIP vectors and loaded
into Qdrant, locally and on Qdrant Cloud. Embedding takes long on a CPU, the
dataset is 271.5 MB, and none of it belongs in the repository.

## Options considered

1. **One script that does everything:** simple, but any failure or a second
   target (Cloud) repeats the slowest work.
2. **Indexing in CI or a cloud job:** reproducible, but needs secrets with
   write access in CI and paid compute for a one-off job.
3. **Local pipeline in stages, each with its own command and output on disk.**

## Decision

A local pipeline in three stages, run with npm scripts written in TypeScript
(executed directly by Node 22):

1. `index:prepare`: downloads the dataset pinned to a commit of the Hugging
   Face mirror, verifies file sizes, and writes `data/catalog.jsonl` plus
   `data/images/{id}.jpg`. Rows are validated and normalized; skipped rows are
   reported.
2. `index:embed`: computes vectors into `data/embeddings/`, resumable.
3. `index:upload`: creates a versioned collection and moves the `products`
   alias.

Everything lives under the git-ignored `data/` directory. Each stage is
idempotent and reuses the previous stage's output.

## Consequences

- Uploading to Qdrant Cloud reuses local vectors; write credentials never
  leave the developer's machine.
- Anyone can rebuild the index from scratch with three commands.
- `data/` takes about 1 GB on disk after `index:prepare` (parquet files plus
  44k small images, which round up to the file system block size).
