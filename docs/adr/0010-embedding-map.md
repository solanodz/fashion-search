# 0010. Show a 2D map of the embedding space

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The app's premise is that CLIP places similar products close together, so a
nearest-neighbour search finds them. The UI showed the query vector and the
scores, but not the space itself.

## Options considered

1. **PCA:** fast and exact, but two linear components keep little of CLIP's
   structure; categories overlap.
2. **t-SNE:** good local clusters, but slow and it distorts global layout
   more than UMAP.
3. **UMAP:** keeps local neighbourhoods and some global structure, runs in
   under a minute on 42,426 vectors with `umap-js`.

Placing the query also needs a choice: UMAP can't project new points without
the fitted model, which is too large to ship to the browser.

## Decision

UMAP (`umap-js`, 15 neighbours, min distance 0.1, seeded), computed offline by
`npm run index:map` from the stored image vectors. Coordinates are scaled to
[0, 1] between the 0.5% and 99.5% quantiles (a few stray products would
otherwise shrink every cluster), quantized to 16 bits, and written with each
product's article type to `public/embedding-map.bin` (424 KB) and
`public/embedding-map.json`. The files are committed: they are small, and
production can't regenerate them without the local vectors.

The query is drawn at the similarity-weighted average position of its top 10
results, and the results are highlighted. Points are coloured by master
category and the largest article types are labelled.

## Consequences

- The map must be regenerated (`index:map`) whenever the catalog or the
  embeddings change; the JSON records the model and point count, and the
  browser rejects a file whose count doesn't match.
- The query position is an approximation: it shows where its nearest
  products are, not where UMAP would put the query.
- About 430 KB more to load, fetched after the page renders.
