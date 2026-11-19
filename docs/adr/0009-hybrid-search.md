# 0009. Hybrid search with keyword vectors

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

CLIP compares the query with how products look, so it misses exact words:
"a red dress" scored 10% on all attributes because red nightdresses and
kurtas look like dresses, even though matching product names literally say
"Dress". Product names in this catalog are descriptive (brand, gender,
colour, type), so keyword matching is a strong complementary signal.

Two constraints: the query text should not reach the server (ADR 0003), and
the server should not run a model.

## Options considered

1. **Only payload filters:** exact, but users have to pick them by hand.
2. **Weighted sum of a dense and a sparse score:** needs both scores on one
   scale; CLIP cosines and BM25 scores are not comparable.
3. **Two retrievers fused by rank (RRF):** no score calibration; standard
   for hybrid search; supported by Qdrant's sparse vectors.

## Decision

Option 3.

- Each point has two named vectors: `image` (CLIP, 512-d, cosine) and
  `keywords` (sparse). The keyword text is the product name, type, colour and
  gender. Documents store BM25's saturated term frequency (k1 = 1.2,
  b = 0.75); Qdrant's `idf` modifier adds the IDF part at query time.
- Tokens are lower-cased, lightly stemmed (plurals), stopwords dropped, and
  "t-shirt" spellings unified; each token is hashed with 32-bit FNV-1a into a
  sparse index. The same code runs in the indexer and the browser, so the
  browser sends token hashes, not the text.
- The server runs both searches in one `queryBatch` (2 × limit candidates
  each) and fuses them with reciprocal rank fusion (k = 60). The score shown
  for every result is still the cosine similarity to the CLIP query, and each
  result says whether the keyword search also found it.
- Keywords are used for text-only searches. With a photo, a refinement such
  as "in blue" would match thousands of unrelated blue products, so combined
  searches stay image-only (ADR 0007).

## Consequences

- Precision@10 over the 27 evaluation queries, same model and catalog:

  | Metric       | Image only | Hybrid |
  | ------------ | ---------: | -----: |
  | Article type |        77% |    89% |
  | Colour       |        78% |    91% |
  | Gender       |        94% |    95% |
  | All          |        59% |    79% |

  The evaluation checks type, colour and gender, which are also in the
  keyword text, so part of the gain is the keyword search matching those
  words directly. That is the intended behaviour for queries that name them.

- Known weak spot: generic words with a high IDF pull in unrelated products,
  e.g. "black **high** heels" ranks "High Black Socks" (20%).
- The collection schema changed (named vectors), so every environment needs
  a fresh `index:upload`.
- Result order is by fused rank, so similarity bars are no longer strictly
  decreasing; that shows where keywords reordered the list.
