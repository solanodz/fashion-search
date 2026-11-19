# Retrieval quality

`npm run index:eval` embeds a fixed set of 27 text queries
([`eval-queries.json`](../src/lib/indexing/eval-queries.json)), searches the
`products` alias and measures **precision@10** per attribute: the share of the
top 10 results whose `articleType`, `baseColour` and `gender` match the
expected values. "All" counts results where every checked attribute matches.
The full report is written to `data/eval/latest.json`.

Run it after any change to the model, quantization, preprocessing or indexing,
and compare against the baseline below.

## Current: hybrid search (2026-11-19)

Text queries search the CLIP image vectors and BM25 keyword vectors, fused by
rank ([ADR 0009](adr/0009-hybrid-search.md)). `npm run index:eval` uses
hybrid search; `-- --mode image` measures the image vectors alone.

| Metric       | Image only | Hybrid |
| ------------ | ---------: | -----: |
| Article type |        77% |    89% |
| Colour       |        78% |    91% |
| Gender       |        94% |    95% |
| All          |        59% |    79% |

Biggest gains in "all": navy blue shirt for men 50% → 100%, gold watch for
women 0% → 60%, red lipstick 0% → 50%, red sweatshirt 20% → 70%, a red dress
10% → 50%, silver watch for men 10% → 50%. Worse: black high heels 60% → 20%
("high" matches "High Black Socks").

The image-only numbers differ slightly from the section below (81/79/94/60)
because the collection was rebuilt with named vectors and HNSW search is
approximate.

## 384×512 photos (2026-11-19)

Same model and queries, catalog photos at up to 384×512 instead of 60×80
([ADR 0008](adr/0008-catalog-photos.md)); 42,426 products.

| Metric       | 60×80 | 384×512 |
| ------------ | ----: | ------: |
| Article type |   79% |     81% |
| Colour       |   75% |     79% |
| Gender       |   93% |     94% |
| All          |   57% |     60% |

Largest changes in "all": men's blue jeans 60% → 100%, blue tie 70% → 100%,
black jacket for men 20% → 60%, black leather handbag 70% → 90%, blue
baseball cap 70% → 90%, yellow top for women 30% → 50%. Worse: gold watch for
women 40% → 0% (the watches are right, the catalog colour is not), pink kurta
for women 80% → 60%, black high heels 80% → 60%. "a red dress" goes from 0% to
10%; it still needs the Dresses filter.

## Baseline: 60×80 thumbnails (2026-11-19)

Model `Xenova/clip-vit-base-patch32`, `q8`, image vectors only, no filters.

| Metric       | Precision@10 |
| ------------ | -----------: |
| Article type |          79% |
| Colour       |          75% |
| Gender       |          93% |
| All          |          57% |

Strong (≥ 80% all): black backpack, black leather wallet for men, black casual
sneakers, brown formal shoes, pink kurta, green saree, black high heels, brown
belt.

Weak (≤ 30% all):

- **"a red dress" (0%)**: returns red nightdresses and kurtas. CLIP sees a
  red, long garment; the catalog's 22 red dresses are outnumbered by similar
  items.
- **"red sweatshirt" (20%)**, **"black jacket for men" (20%)**: confused with
  t-shirts and other topwear, the largest categories.
- **Metallic colours** ("silver watch for men" 20%, "red lipstick" 30%,
  "gold earrings" 50%): the type is right, but the catalog colour often
  describes the dial, strap or packaging rather than what dominates the image.

## Ideas to try (not done yet)

- Combine vector search with the payload filters (gender, category, colour)
  that the UI will expose; most weak queries are fixed by one filter.
- Prompt templates for queries ("a photo of a red dress"), as in the CLIP
  paper.
- Compare `q8` with `fp32` vectors for the catalog to measure the cost of
  quantization.
