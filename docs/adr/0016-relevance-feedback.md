# 0016. Refine a search with likes and dislikes

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

A query rarely says everything the shopper wants. Someone types "dresses",
sees the results and knows at once which ones are right, without having the
words (or the patience) to say "red, for women, casual". Marking a result as
"more like this" or "less like this" is the classic answer: relevance
feedback. The question was what to do with the marks.

To measure it, `npm run index:feedback-eval` simulates a shopper on the 27
evaluation queries. In the main scenario the query names only the type and
the shopper also wants the colour and gender of the original query, never
typed. Each round they like the first result on the page that fits and
dislike the first of the top 10 that doesn't. A second scenario uses the full
queries, where feedback must not make a good search worse. The metric is
precision@10: results where every expected attribute matches.

## Options considered

1. **Only remove the marked products:** no steering at all. 23% stays at 22%.
2. **Move the query vector:** towards the liked products and away from the
   disliked ones, either with Qdrant's recommendation query or by hand
   (Rocchio). Both reach about 38–43% after one round, and they make the full
   queries _worse_ (93% → 89%): CLIP's image vectors weigh shape over colour
   (ADR 0015), so liking one red dress pulls in dresses of that cut in any
   colour.
3. **Read the catalog fields of the marked products:** put first the
   candidates that share what every liked product has in common, and last
   those with a value only disliked products have. 79% after one round.
4. **Both:** 83% after one round, 85% after three; the full queries go from
   93% to nearly 100%.

## Decision

Option 4, with each half doing what it is good at.

- **The look, in Qdrant.** The image search becomes a recommendation query:
  `positive` is the query vector plus the liked products, `negative` the
  disliked ones, with the `average_vector` strategy (one search around the
  average of the positives, pushed away from the average of the negatives).
  The other strategies and a hand-made Rocchio update scored the same within
  noise on 27 queries; this one needs no extra round trip. Keyword matches
  are still fused in by rank (ADR 0009).
- **The fields, in `src/lib/search/feedback.ts`.** From type, colour, gender
  and use: a value is _preferred_ when every liked product has it, and
  _avoided_ when a disliked product has it and a liked one differs. A dislike
  alone says nothing about fields (it doesn't say which one was wrong), so it
  only moves the vector. The 100 fused candidates are reordered by how many
  preferred values they have, minus the avoided ones; ties keep their order.
- Marked products leave the results. The scores shown are still similarities
  to the query as typed.
- `/api/search` takes `feedback: { like, dislike }` (up to ten ids each) and
  answers with the `leaning` it read, which the page shows: "First, what your
  likes share: dresses, red, women, casual."
- Marks are part of the URL (`&up=…&down=…`), survive a filter change and are
  dropped by a new search.

## Consequences

- One like and one dislike take a vague search from 23% to 83% of results
  that fit what the shopper wanted but never typed.
- The measurement favours the fields: relevance is defined by the same labels
  the reordering reads. It shows the mechanism works, not how real shoppers
  mark. The vector half is what covers what labels don't say (cut, pattern),
  and that part is not measured.
- A shopper who likes two products that differ in a field stops steering on
  that field, which is the intended reading ("either is fine").
- Refining costs one extra read of the marked products' fields, and compare
  mode is off while marks are active.
- While measuring, the plain hybrid search turned out to depend on how many
  candidates each list brings: with 20 (what the evaluation asks for)
  precision@10 is 80%; with 72 (what the search page asks for) it is 93%.
  Fixing the pool at 100 for every request is a separate change.
