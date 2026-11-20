# 0010. Show a 3D map of the embedding space

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The app's premise is that CLIP places similar products close together, so a
nearest-neighbour search finds them. The UI showed the query vector and the
scores, but not the space itself.

## Options considered

1. **PCA:** fast and exact, but a few linear components keep little of
   CLIP's structure; categories overlap.
2. **t-SNE:** good local clusters, but slow and it distorts global layout
   more than UMAP.
3. **UMAP:** keeps local neighbourhoods and some global structure, and runs
   in about a minute on 42,426 vectors with `umap-js`.

Two more choices: how many dimensions to show, and how to place the query.
A first version used 2D; it read as a flat chart rather than a space, so
the map is 3D. UMAP can't project new points without the fitted model, which
is too large to ship to the browser.

## Decision

UMAP to three dimensions (`umap-js`, 15 neighbours, min distance 0.1,
seeded), computed offline by `npm run index:map` from the stored image
vectors. Coordinates are scaled into the unit cube between the 0.5% and
99.5% quantiles of each axis (a few stray products would otherwise shrink
every cluster), quantized to 16 bits, and written with each product's
article type to `public/embedding-map.bin` (509 KB) and
`public/embedding-map.json`. The files are committed: they are small, and
production can't regenerate them without the local vectors.

The browser draws the cloud on a 2D canvas with its own perspective
projection, no 3D library: points are batched by colour and depth band
(further is smaller and fainter), with the cube's edges as a depth cue. It
turns slowly until touched (not for visitors who prefer reduced motion);
dragging rotates it, and the expanded view adds zoom and a search box. The
query is drawn at the similarity-weighted average position of its top 10
results, and joined to them by lines in the expanded view.

## Consequences

- The map must be regenerated (`index:map`) whenever the catalog or the
  embeddings change; the JSON records the model, point count and
  dimensions, and the browser rejects a file that doesn't match.
- The query position is an approximation: it shows where its nearest
  products are, not where UMAP would put the query.
- About 520 KB more to load, fetched after the page renders, and a canvas
  redrawn every frame while the map turns.
