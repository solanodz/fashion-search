# Retrieval quality

`npm run index:eval` embeds a fixed set of 27 text queries
([`eval-queries.json`](../src/lib/indexing/eval-queries.json)), searches the
`products` alias and measures **precision@10** per attribute: the share of the
top 10 results whose `articleType`, `baseColour` and `gender` match the
expected values. "All" counts results where every checked attribute matches.
The full report is written to `data/eval/latest.json`.

Run it after any change to the model, quantization, preprocessing or indexing,
and compare against the baseline below.

## Catalog labels (2026-11-23)

`npm run index:health` runs the tagging vote over every product: each one is
tagged by its 10 nearest neighbours and flagged when at least
90% of the vote names a different type than its label
([ADR 0015](adr/0015-photo-tagging.md)). 552 of 42,426 products
(1.3%) are flagged. The most common disagreements:

| Labelled     | Looks like   | Products |
| ------------ | ------------ | -------: |
| Sports Shoes | Casual Shoes |       50 |
| Kurtis       | Kurtas       |       41 |
| Casual Shoes | Sports Shoes |       38 |
| Flats        | Heels        |       29 |
| Casual Shoes | Formal Shoes |       23 |
| Free Gifts   | Watches      |       23 |
| Tops         | Tshirts      |       15 |
| Sandals      | Flip Flops   |       15 |

Some are types that overlap; others are real, like the watches filed under
"Free Gifts". No photo is in the catalog twice: the two most alike products
are 0.987 similar; 728 pairs are above 0.98 and
9,106 above 0.97.

## Auto-tagging (2026-11-23)

Not retrieval but classification, and not on the site: a new product's
catalog fields are suggested from its photo by letting its nearest products
vote ([ADR 0015](adr/0015-photo-tagging.md)). `npm run index:tag-eval` takes
2,021 catalog products (every 21st), hides each one in turn, tags it
from the rest and compares with its own labels.

| Field         | Right | Without near-identical products | Always the most common value | Confident suggestions | Confident and right |
| ------------- | ----: | ------------------------------: | ---------------------------: | --------------------: | ------------------: |
| Category      | 99.4% |                           94.4% |              47.8% (Apparel) |                 99.3% |               99.5% |
| Subcategory   | 96.2% |                           90.9% |              34.7% (Topwear) |                 91.6% |               98.5% |
| Type          | 87.4% |                           81.8% |              16.1% (Tshirts) |                 71.4% |               96.7% |
| Colour        | 61.9% |                           57.8% |                22.3% (Black) |                 34.4% |               88.5% |
| Who it is for | 91.7% |                           87.1% |                  50.5% (Men) |                 83.1% |               97.6% |
| Use           | 92.6% |                           87.3% |               77.6% (Casual) |                 84.0% |               97.0% |
| Season        | 77.3% |                           71.6% |               48.6% (Summer) |                 46.2% |               95.1% |

- **Without near-identical products:** neighbours at 0.95 similarity or more
  (the same item in another colour, or listed twice) don't vote. Closer to
  tagging a kind of product the catalog hasn't seen.
- **Confident suggestions:** the share of products whose suggestion got at
  least 80% of the vote, and how often those are right. The rest are marked
  to check.
- **Colour:** voted by CLIP similarity alone it is right
  50.7% of the time; weighting 30 neighbours by
  colour histogram, 61.9%; with 60
  neighbours, 64.7% on the half of the sample not used for tuning.
- Catalog photos are studio shots, so a seller's phone photo will do worse;
  that is not measured.

## Spanish (2026-11-20)

The same 27 queries in Rioplatense Spanish (`es` in the queries file),
rewritten in English with the glossary of
[ADR 0011](adr/0011-spanish-queries.md):
`npm run index:eval -- --lang es --translate`.

| Approach                         | Type | Colour | Gender | All |
| -------------------------------- | ---: | -----: | -----: | --: |
| English, hybrid                  |  89% |    91% |    95% | 80% |
| Spanish without glossary, hybrid |  46% |    43% |    84% | 17% |
| Spanish with glossary, hybrid    |  87% |    92% |    94% | 78% |

## Hybrid search (2026-11-19)

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
