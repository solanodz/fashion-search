# 0007. Combine photo and text queries with a weighted vector sum

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Search should accept a photo plus a text refinement, such as a red dress with
"in blue", and return items like the photo but matching the text. CLIP places
images and text in one space, so the query can be built from both vectors.

## Options considered

1. **Weighted sum of the normalized vectors**, normalized again.
2. **Parse the text into filters** (colour words → `baseColour`): precise for
   colours, but brittle and limited to attributes the catalog has.
3. **Two searches and merge the rankings:** more requests and no clear way to
   express "like this, but different".

## Decision

Option 1: `normalize(photo + w · text)`, computed in the browser
(`combine()` in `src/lib/clip/vector.ts`) with `w = COMBINED_TEXT_WEIGHT = 2`.

The weight was chosen with a small experiment on the local index: four
products (red dress, black casual shoes, brown handbag, white t-shirt) combined
with a colour refinement, counting how many of the top 10 kept the article
type and took the requested colour.

| Text weight | Type kept (of 90) | Colour followed (of 90) |
| ----------: | ----------------: | ----------------------: |
|         0.5 |                66 |                      34 |
|           1 |                62 |                      58 |
|         1.5 |                63 |                      69 |
|           2 |                66 |                      73 |
|           3 |                62 |                      83 |

At 1 the colour barely moves; at 3 the photo starts to lose the article type.
2 keeps the type at its best level while following the colour.

## Consequences

- No extra server work or request: the server still receives one vector.
- The weight is a single constant; revisit it with `index:eval`-style
  measurements if the model or quantization changes.
- Filters (next step) remain the precise tool when users need an exact
  attribute.
