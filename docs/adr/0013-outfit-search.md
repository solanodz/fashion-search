# 0013. Shop the look: search every garment in a photo of a person

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

Users want to upload a photo of a person and find the closest catalog products
to each thing they wear. Photo search (ADR 0007) encodes the whole photo, so a
street photo returns products that look like the photo, not like each garment.

## Decision

`/outfit` runs four steps per photo:

1. **Segmentation in the browser.** `Xenova/segformer_b2_clothes` (SegFormer-B2
   on the ATR human parsing dataset, 8-bit ONNX, 28.8 MB) labels every pixel:
   hat, sunglasses, upper clothes, skirt, pants, dress, belt, shoes, bag,
   scarf. `garments.ts` turns the labels into one region per garment (top,
   bottom, dress, shoes, bag…), drops regions too small to search, keeps the
   dress or the separates (whichever covers more), and keeps only the bigger
   shoe. It runs in the CLIP worker.
2. **Crop and encode.** Each garment's box is framed at the catalog's 3:4
   and encoded with CLIP's image model. The crop keeps the person and the
   background: most catalog clothes are photographed on a person, and cutting
   the garment out onto white made results worse on real photos (a plaid
   coat returned blue plaid shirts).
3. **Read it as text.** CLIP's image vectors weigh shape and pattern over
   colour, so each garment also gets a text:
   - When "Describe with AI" is on, `/api/describe` sends the photo,
     downscaled to 512 px, to OpenAI's cheapest vision model (`gpt-6-luna`,
     $0.10 / 1M input tokens in Nov 2026, "low" detail) with a strict JSON
     schema: per garment, a slot, a catalog article type, a catalog colour
     and a short description in catalog words ("maroon checked long wool
     coat"). The key stays on the server, requests are rate-limited per IP,
     and responses are not stored (`store: false`).
   - Otherwise (switched off, no `OPENAI_API_KEY`, or an error), CLIP
     zero-shot classification picks the colour and type from prompts like
     "a photo of a maroon bag" (`attributes.ts`).
4. **Hybrid search per garment** (`query.ts`): the crop's vector plus twice
   the text's vector (as in ADR 0007), the text's keyword vector (ADR 0009),
   and filters for the garment's part of the catalog, its article type when
   trustworthy (always from the description, from CLIP above 50%), and the
   described gender when none is chosen. Garments only the description found
   are searched by text alone.

## Options considered

- **Whole photo with a category filter**: no segmentation, but the other
  garments and the background pull every result.
- **Cut-out on white**: matches product shots (bags, shoes) but not the
  on-model photos of clothes; measured worse on a real photo.
- **CLIP zero-shot only**: free and local, but colour and type are often
  wrong on small or occluded garments (jeans read as "beige skirts").
- **A vision language model for everything**: it describes well but can't
  rank 42,000 products; it complements the vector search instead.

## Consequences

- On a real street photo (plaid maroon coat, jeans, burgundy bag, brown
  boots) results went from blue shirts, black track pants, black bags and
  flip flops to long coats, blue jeans, dark brown handbags and brown ankle
  boots.
- On catalog photos of people wearing the product (120 photos, 8 types,
  `npm run index:outfit-eval`), the segmentation finds the product's garment
  in 93% of them. These photos are studio shots, so they understate the gain
  on real photos.
- With the description on, the photo leaves the browser; the page says so and
  the switch keeps a fully local mode. Each description costs a fraction of a
  cent and takes about 4–5 s, in parallel with segmentation.
- The segmentation model is under NVIDIA's SegFormer licence, for
  non-commercial use. Fine for this portfolio; a commercial use needs another
  model.
- The catalog has few coats and no category for boots ("Casual Shoes" whose
  names say "Boots"), which limits what any query can return.
