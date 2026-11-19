# Retrieval quality

`npm run index:eval` embeds a fixed set of 27 text queries
([`eval-queries.json`](../src/lib/indexing/eval-queries.json)), searches the
`products` alias and measures **precision@10** per attribute: the share of the
top 10 results whose `articleType`, `baseColour` and `gender` match the
expected values. "All" counts results where every checked attribute matches.
The full report is written to `data/eval/latest.json`.

Run it after any change to the model, quantization, preprocessing or indexing,
and compare against the baseline below.

## Baseline (2026-11-19)

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
