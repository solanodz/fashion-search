/**
 * Reads a garment's colour and type off its cut-out with CLIP zero-shot
 * classification: the cut-out's image vector is compared with the text
 * vectors of prompts like "a photo of a maroon bag". CLIP's image vectors
 * weigh shape and pattern over colour, so the prediction is added to the
 * search as text (ADR 0013). Model-free; the vectors come from the worker.
 */

/** Dot product; equal to cosine similarity for CLIP's unit vectors. */
function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Catalog article types a garment can be, with the words a prompt uses. */
export const TYPES: Record<string, { type: string; noun: string }[]> = {
  top: [
    { type: "Tshirts", noun: "t-shirt" },
    { type: "Shirts", noun: "shirt" },
    { type: "Tops", noun: "women's top" },
    { type: "Sweatshirts", noun: "sweatshirt" },
    { type: "Sweaters", noun: "sweater" },
    { type: "Jackets", noun: "jacket or coat" },
    { type: "Blazers", noun: "blazer" },
    { type: "Kurtas", noun: "kurta" },
    { type: "Tunics", noun: "tunic" },
  ],
  bottom: [
    { type: "Jeans", noun: "pair of jeans" },
    { type: "Trousers", noun: "pair of trousers" },
    { type: "Track Pants", noun: "pair of track pants" },
    { type: "Shorts", noun: "pair of shorts" },
    { type: "Leggings", noun: "pair of leggings" },
    { type: "Capris", noun: "pair of capris" },
    { type: "Skirts", noun: "skirt" },
  ],
  dress: [
    { type: "Dresses", noun: "dress" },
    { type: "Jumpsuit", noun: "jumpsuit" },
  ],
  bag: [
    { type: "Handbags", noun: "handbag" },
    { type: "Backpacks", noun: "backpack" },
    { type: "Clutches", noun: "clutch" },
    { type: "Duffel Bag", noun: "duffel bag" },
    { type: "Laptop Bag", noun: "laptop bag" },
    { type: "Messenger Bag", noun: "messenger bag" },
  ],
  shoes: [
    { type: "Casual Shoes", noun: "pair of casual shoes or boots" },
    { type: "Sports Shoes", noun: "pair of sneakers" },
    { type: "Formal Shoes", noun: "pair of formal leather shoes" },
    { type: "Heels", noun: "pair of high heels" },
    { type: "Flats", noun: "pair of flat shoes" },
    { type: "Sandals", noun: "pair of sandals" },
    { type: "Flip Flops", noun: "pair of flip flops" },
  ],
  hat: [
    { type: "Caps", noun: "cap" },
    { type: "Hat", noun: "hat" },
  ],
};

/** A generic name per garment, for colour prompts ("a photo of a red top"). */
const GENERIC: Record<string, string> = {
  hat: "hat",
  sunglasses: "pair of sunglasses",
  scarf: "scarf",
  top: "top",
  dress: "dress",
  bottom: "pair of trousers",
  belt: "belt",
  bag: "bag",
  shoes: "pair of shoes",
};

/**
 * The catalog's colours (its baseColour labels) that cover most products,
 * leaving out vague ones ("Multi", "Metallic") and near-duplicates.
 */
export const COLOURS = [
  "Black",
  "White",
  "Blue",
  "Navy Blue",
  "Brown",
  "Grey",
  "Red",
  "Maroon",
  "Green",
  "Olive",
  "Pink",
  "Purple",
  "Yellow",
  "Beige",
  "Cream",
  "Orange",
  "Silver",
  "Gold",
  "Khaki",
  "Teal",
  "Tan",
  "Mustard",
  "Peach",
  "Lavender",
  "Charcoal",
];

export function typePrompts(garment: string): string[] {
  return (TYPES[garment] ?? []).map(({ noun }) => `a photo of a ${noun}`);
}

export function colourPrompts(garment: string): string[] {
  const noun = GENERIC[garment] ?? "garment";
  return COLOURS.map(
    (colour) => `a photo of a ${colour.toLowerCase()} ${noun}`,
  );
}

/** CLIP's learned temperature: similarities × 100 before the softmax. */
const LOGIT_SCALE = 100;

/** Softmax of scaled cosine similarities: the probability of each label. */
export function zeroShot(
  image: ArrayLike<number>,
  labels: ArrayLike<number>[],
): number[] {
  const logits = labels.map((label) => dot(image, label) * LOGIT_SCALE);
  const max = Math.max(...logits);
  const exps = logits.map((logit) => Math.exp(logit - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((value) => value / sum);
}

export type Reading = {
  colour: string;
  colourConfidence: number;
  /** A catalog article type, or null for garments with a single type. */
  type: string | null;
  typeConfidence: number;
  /** In catalog words, for the keyword search: "Maroon Handbags". */
  text: string;
};

/** Index of the largest value. */
const argmax = (values: number[]) =>
  values.reduce((best, value, i) => (value > values[best] ? i : best), 0);

/**
 * The most likely colour and type of a garment, given its cut-out's image
 * vector and the text vectors of its colour and type prompts (same order as
 * colourPrompts and typePrompts).
 */
export function readGarment(
  garment: string,
  image: ArrayLike<number>,
  colourVectors: ArrayLike<number>[],
  typeVectors: ArrayLike<number>[],
): Reading {
  const colours = zeroShot(image, colourVectors);
  const c = argmax(colours);
  const types = typeVectors.length > 0 ? zeroShot(image, typeVectors) : [];
  const t = types.length > 0 ? argmax(types) : -1;
  const type = t >= 0 ? TYPES[garment][t].type : null;
  return {
    colour: COLOURS[c],
    colourConfidence: colours[c],
    type,
    typeConfidence: t >= 0 ? types[t] : 1,
    text: [COLOURS[c], type ?? GENERIC[garment] ?? garment].join(" "),
  };
}
