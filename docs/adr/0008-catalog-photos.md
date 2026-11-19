# 0008. Take catalog photos from a 384×512 mirror

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The catalog's photos came from `ashraq/fashion-product-images-small`, whose
images are 60×80 thumbnails. They look blurry in the results grid, and CLIP
embeds them after upscaling to 224×224, which loses detail. The metadata in
that mirror (names, categories, colours) is good and is what the filters and
the evaluation rely on.

## Options considered

1. **Keep the 60×80 thumbnails:** no work, but the main thing a visitor sees
   looks poor.
2. **`ceyda/fashion-products-small`:** the same Kaggle dataset with photos
   resized to at most 512 px (384×512 for most), keyed by the same product
   ids. 597 MB on Hugging Face. It has 42,700 rows, so some products have no
   photo, and its card declares no license (the source dataset is MIT).
3. **The original Kaggle dataset at full resolution:** every product and a
   clear MIT license, but about 25 GB, behind a Kaggle account, and it would
   need resizing for the web anyway.
4. **Another catalog (H&M, DeepFashion):** more products, but restricted to
   non-commercial or research use, which doesn't fit a public portfolio.

## Decision

Option 2. `index:prepare` reads metadata from the `ashraq` mirror and photos
from the `ceyda` mirror, both pinned to a commit, joined on product id.
Products without a photo there are left out of the catalog: 1,646 of 44,072
(3.7%), concentrated in make-up (for example 164 of 260 lipsticks). The
catalog now has 42,426 products, and credit to the original dataset is kept
in the README and the page footer.

## Consequences

- Photos are about 6× sharper per side; 655 MB in total, still well within
  R2's free tier (ADR 0005).
- Retrieval improved with the same model (precision@10 over the 27 evaluation
  queries): article type 79% → 81%, colour 75% → 79%, gender 93% → 94%, all
  attributes 57% → 60%. See `docs/evaluation.md`.
- The make-up categories are thinner than before.
- `index:prepare` downloads 868 MB in total (both mirrors) on first run.
