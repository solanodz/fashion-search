# 0015. Tag a new product from its photo with a nearest-neighbour vote

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

Every new product needs a category, a type, a colour and who it is for before
search and filters can find it. Typed by hand, those fields are slow to fill
and inconsistent. The catalog already holds 42,426 products with those labels
and a CLIP image vector each, so a new photo can be compared with all of them
in one query. The question was how well the catalog can tag a product by
itself, and with what method.

## Options considered

1. **Zero-shot classification with text prompts**, as the outfit search does
   for a few garment types (ADR 0013): needs no labelled data, but every
   value needs a prompt, and CLIP is weak at colour. On the same sample used
   below, the best colour prompt ("a photo of a {colour} {type}") was right
   27% of the time (one-off experiment).
2. **Train a classifier on the vectors** (one per field): probably a little
   more accurate, but it has to be trained, served and retrained whenever the
   catalog or its vocabulary changes.
3. **Ask a vision language model**: flexible, but it costs per photo, sends
   the photo out, and doesn't know the store's vocabulary unless every list
   goes in the prompt.
4. **Let the nearest products vote** (k-nearest neighbours): no training, no
   new service (one vector search), it follows the catalog as it changes, and
   it can show its evidence: the products that voted.

## Decision

Option 4, as a library and two scripts. `src/lib/tagging/suggest.ts` takes a
photo's nearest products and lets them vote on each field:

- **Category, subcategory, type, who it is for, use and season:** the 10
  closest products vote; a vote fades with distance from the closest one
  (a product 0.02 less similar counts e times less).
- **Colour:** CLIP's vectors weigh shape over colour, so a blue shirt's
  neighbours are shirts of any colour and the plain vote is right only 51%
  of the time. Instead the 30 closest products vote, weighted by how alike
  their colours and the photo's are: each photo is shrunk to 30×40 pixels and
  summarised as a histogram of hue, saturation and brightness, skipping the
  white background and counting the centre more (`colour.ts`). That is right
  62% of the time.
- **Confidence** is the winner's share of the vote. At 80% or more a field
  could be filled in without review; below, it should be checked.
- **The catalog itself** (`health.ts`): the same vote, run over every
  product, flags the ones whose type at least 90% of the vote contradicts.

`npm run index:tag-eval` measures the vote on 2,021 catalog products, each
hidden in turn and tagged by the rest; `npm run index:health` runs it over
the whole catalog. Numbers in
[docs/evaluation.md](../evaluation.md#auto-tagging-2026-11-23). The number
of voters and the fading barely matter (the best six settings are within
0.2 points); the colour weighting was tuned on half of the sample and checked
on the other half.

## Consequences

- Type is right 87% of the time and category 99%, against 16% and 48% for
  always guessing the most common value. Confident suggestions (71% of
  products for the type) are right 97% of the time.
- The test is kinder than real use: catalog photos are studio shots, and a
  product's neighbours are often the same item in another colour. Without
  neighbours that are 0.95 similar or more, type drops to 82%. A seller's
  phone photo is not measured.
- Colour is the weak field (62%). Part of it is the labels: the catalog has
  46 colour names ("Navy Blue" next to "Blue", "Off White" next to "White").
- The colour vote needs the neighbours' photos (30 small JPEGs per product).
  Storing each product's histogram in its payload would avoid that and allow
  more voters: with 60, colour reaches 64%.
- Over the whole catalog, 552 products (1.3%) have a type their neighbours
  contradict. Some are types that overlap (casual and sports shoes); others
  are real problems, like 23 watches filed under "Free Gifts".
- No photo is in the catalog twice: the two most alike products are 0.987
  similar. A duplicate check at listing time could use 0.99 without flagging
  lookalikes (about 9,100 pairs are above 0.97, mostly one model in two
  colours).
- **Not on the site.** A page that tagged an uploaded photo with this vote
  was built and taken off the same day, to keep the site to three demos
  (search, Shop the look and the shopping assistant). The library, its tests
  and both scripts stay, so the page can come back without redoing the
  measurements.
