# 0011. Search in Spanish with a fashion glossary

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

CLIP's text encoder was trained mostly on English, and product names are in
English, so Spanish queries did poorly: "remera blanca para hombre" returned
shirts, "mochila negra" returned wallets. The site should work in Spanish and
English.

The 27 evaluation queries were translated into Rioplatense Spanish (`es` in
`eval-queries.json`) to measure each option. Precision@10, all attributes:

| Approach                                          | English | Spanish |
| ------------------------------------------------- | ------: | ------: |
| CLIP text encoder, hybrid search (before)         |     80% |     17% |
| Multilingual text encoder, image only             |     52% |     30% |
| Multilingual text encoder, hybrid search          |     75% |     24% |
| Glossary to English, then CLIP, image only        |     59% |     59% |
| **Glossary to English, then CLIP, hybrid search** | **80%** | **78%** |

## Options considered

1. **A multilingual text encoder in CLIP's space**
   (`sentence-transformers/clip-ViT-B-32-multilingual-v1`, ONNX in
   `aurantium/…`): keeps the image vectors, covers 50+ languages. But it is
   136 MB (twice the current text model), loses 5 points in English, and
   understands neutral Spanish better than Rioplatense ("remera", "campera",
   "ojotas", "aros" failed). Its vectors for "un vestido rojo" and CLIP's for
   "a red dress" agree (cosine 0.96), yet keywords still miss: Spanish words
   don't match English names.
2. **Machine translation in the browser** (`opus-mt-es-en`): about 110 MB,
   Spanish only, adds latency, and needs language detection.
3. **A new multilingual model for images and text** (multilingual SigLIP,
   jina-clip-v2): 380–870 MB and re-embedding the catalog.
4. **A glossary**: the catalog's vocabulary is closed (141 article types, 46
   colours, genders), so a hand-written Spanish → English glossary of
   garments, colours, materials and genders, with Rioplatense and neutral
   variants, covers most queries. No download, no latency.

## Decision

Option 4. `translateQuery` (`src/lib/search/spanish.ts`) normalizes the query
(lower case, no accents, singular masculine forms), replaces known phrases
("anteojos de sol", "azul marino", "taco alto") and words, drops Spanish
stopwords, and orders the result the English way: modifiers, nouns, then
"for <gender>" ("remera blanca para hombre" → "white t-shirt for men").
Unknown words, such as brands, pass through. A query counts as Spanish only
if it has a Spanish stopword or a word the glossary translates, so English
queries are untouched. The English text then feeds both CLIP and the keyword
search, in the browser; the pipeline shows how the query was read.

## Consequences

- Spanish matches English on the evaluation (78% vs 80%). The glossary was
  written with the catalog's vocabulary, which the evaluation queries share,
  so free phrasing scores lower: words outside the glossary ("algo para la
  playa") pass through untranslated.
- Other languages are not covered; option 1 remains the path if they are
  needed.
- The glossary must grow with the catalog's vocabulary.
- `npm run index:eval -- --lang es --translate` measures it.
