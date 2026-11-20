/**
 * Spanish fashion queries rewritten in English with a glossary (ADR 0011),
 * so the English CLIP text encoder and the English product names can match
 * them. The catalog's vocabulary is closed (article types, colours,
 * genders), which makes a glossary practical; it covers neutral and
 * Rioplatense terms ("remera", "campera", "ojotas"). Words it doesn't know,
 * such as brand names, pass through unchanged. English queries are left
 * as they are.
 */

type Kind = "noun" | "modifier" | "gender";

/** Multi-word Spanish phrases, matched before single words. */
const PHRASES: [string, string, Kind][] = [
  ["anteojos de sol", "sunglasses", "noun"],
  ["lentes de sol", "sunglasses", "noun"],
  ["gafas de sol", "sunglasses", "noun"],
  ["zapatos de taco alto", "high heels", "noun"],
  ["zapatos de tacon alto", "high heels", "noun"],
  ["zapatos de taco", "heels", "noun"],
  ["zapatos de tacon", "heels", "noun"],
  ["taco alto", "high heels", "noun"],
  ["tacos altos", "high heels", "noun"],
  ["zapatos de vestir", "formal shoes", "noun"],
  ["pantalon deportivo", "track pants", "noun"],
  ["pantalones deportivos", "track pants", "noun"],
  ["traje de bano", "swimwear", "noun"],
  ["ropa interior", "innerwear", "noun"],
  ["esmalte de unas", "nail polish", "noun"],
  ["lapiz labial", "lipstick", "noun"],
  ["brillo labial", "lip gloss", "noun"],
  ["manga larga", "long sleeve", "modifier"],
  ["manga corta", "short sleeve", "modifier"],
  ["azul marino", "navy blue", "modifier"],
  ["verde agua", "sea green", "modifier"],
  ["para correr", "running", "modifier"],
  ["de vestir", "formal", "modifier"],
];

const NOUNS: Record<string, string> = {
  vestido: "dress",
  remera: "t-shirt",
  camiseta: "t-shirt",
  playera: "t-shirt",
  camisa: "shirt",
  blusa: "top",
  top: "top",
  tunica: "tunic",
  pantalon: "trousers",
  jean: "jeans",
  jeans: "jeans",
  vaquero: "jeans",
  short: "shorts",
  bermuda: "shorts",
  pollera: "skirt",
  falda: "skirt",
  campera: "jacket",
  chaqueta: "jacket",
  chamarra: "jacket",
  buzo: "sweatshirt",
  sudadera: "sweatshirt",
  sweater: "sweater",
  sueter: "sweater",
  pulover: "sweater",
  chaleco: "waistcoat",
  calza: "leggings",
  media: "socks",
  calcetin: "socks",
  zapatilla: "sneakers",
  tenis: "sneakers",
  zapato: "shoes",
  sandalia: "sandals",
  ojota: "flip flops",
  chancla: "flip flops",
  chinela: "flip flops",
  bota: "boots",
  botineta: "booties",
  chata: "flats",
  balerina: "flats",
  taco: "heels",
  tacon: "heels",
  reloj: "watch",
  cartera: "handbag",
  bolso: "handbag",
  bolsa: "bag",
  mochila: "backpack",
  billetera: "wallet",
  monedero: "wallet",
  cinturon: "belt",
  cinto: "belt",
  corbata: "tie",
  gorra: "cap",
  gorro: "cap",
  bufanda: "scarf",
  panuelo: "scarf",
  anteojo: "glasses",
  lente: "glasses",
  gafa: "glasses",
  aro: "earrings",
  arete: "earrings",
  pendiente: "earrings",
  caravana: "earrings",
  collar: "necklace",
  cadena: "chain",
  anillo: "ring",
  pulsera: "bracelet",
  brazalete: "bracelet",
  perfume: "perfume",
  desodorante: "deodorant",
  labial: "lipstick",
  esmalte: "nail polish",
  corpino: "bra",
  sosten: "bra",
  bombacha: "briefs",
  calzon: "briefs",
  boxer: "boxers",
  pijama: "night suit",
  camison: "nightdress",
  guante: "gloves",
  enterito: "jumpsuit",
  mono: "jumpsuit",
  kurta: "kurta",
  sari: "saree",
};

const MODIFIERS: Record<string, string> = {
  rojo: "red",
  azul: "blue",
  negro: "black",
  blanco: "white",
  gris: "grey",
  verde: "green",
  amarillo: "yellow",
  rosa: "pink",
  rosado: "pink",
  violeta: "purple",
  morado: "purple",
  purpura: "purple",
  lila: "lavender",
  naranja: "orange",
  anaranjado: "orange",
  marron: "brown",
  cafe: "brown",
  castano: "brown",
  beige: "beige",
  dorado: "gold",
  oro: "gold",
  plateado: "silver",
  plata: "silver",
  celeste: "light blue",
  bordo: "maroon",
  granate: "maroon",
  burdeos: "maroon",
  crema: "cream",
  turquesa: "turquoise",
  fucsia: "magenta",
  mostaza: "mustard",
  oliva: "olive",
  caqui: "khaki",
  kaki: "khaki",
  multicolor: "multicolour",
  cuero: "leather",
  piel: "leather",
  algodon: "cotton",
  deportivo: "sports",
  casual: "casual",
  urbano: "casual",
  formal: "formal",
  elegante: "formal",
  estampado: "printed",
  liso: "solid",
  rayado: "striped",
  raya: "striped",
  cuadro: "check",
  largo: "long",
  corto: "short",
  grande: "large",
  chico: "small",
  pequeno: "small",
  fiesta: "party",
  noche: "evening",
  playa: "beach",
  verano: "summer",
  invierno: "winter",
  oficina: "office",
  trabajo: "office",
  color: "colourful",
  basquet: "basketball",
  futbol: "football",
  sol: "sun",
};

const GENDERS: Record<string, string> = {
  hombre: "men",
  varon: "men",
  caballero: "men",
  masculino: "men",
  mujer: "women",
  dama: "women",
  femenino: "women",
  nino: "boys",
  nene: "boys",
  nina: "girls",
  nena: "girls",
  unisex: "unisex",
};

/** Dropped when translating, but also English, so they don't mark a query as Spanish. */
const SHARED_STOPWORDS = new Set(["a"]);

const STOPWORDS = new Set([
  "al",
  "algo",
  "un",
  "una",
  "unos",
  "unas",
  "el",
  "la",
  "los",
  "las",
  "de",
  "del",
  "para",
  "con",
  "en",
  "y",
  "o",
  "que",
  "mi",
  "busco",
  "quiero",
]);

/** Lower-case, strip accents and punctuation. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Singular, masculine base form: "rojas" → "rojo", "zapatillas" → "zapatilla". */
function lemmas(word: string): string[] {
  const forms = [word];
  if (word.endsWith("es")) forms.push(word.slice(0, -2));
  if (word.endsWith("s")) forms.push(word.slice(0, -1));
  for (const form of [...forms]) {
    if (form.endsWith("a")) forms.push(`${form.slice(0, -1)}o`);
  }
  return forms;
}

function lookup(word: string): [string, Kind] | null {
  for (const form of lemmas(word)) {
    if (NOUNS[form]) return [NOUNS[form], "noun"];
    if (MODIFIERS[form]) return [MODIFIERS[form], "modifier"];
    if (GENDERS[form]) return [GENDERS[form], "gender"];
  }
  return null;
}

/**
 * The query in English when it looks Spanish, otherwise unchanged.
 * Modifiers go before nouns and the gender last: "remera blanca para
 * hombre" → "white t-shirt for men".
 */
export function translateQuery(query: string): {
  text: string;
  translated: boolean;
} {
  let rest = ` ${normalize(query)} `;
  const parts: { text: string; kind: Kind; at: number }[] = [];
  let spanish = false;

  for (const [phrase, english, kind] of PHRASES) {
    const at = rest.indexOf(` ${phrase} `);
    if (at === -1) continue;
    parts.push({ text: english, kind, at });
    rest = rest.replace(` ${phrase} `, ` ${"_".repeat(phrase.length)} `);
    spanish = true;
  }

  let position = 0;
  for (const word of rest.trim().split(" ")) {
    position += word.length + 1;
    if (!word || word.startsWith("_")) continue;
    if (SHARED_STOPWORDS.has(word)) continue;
    if (STOPWORDS.has(word)) {
      spanish = true;
      continue;
    }
    const found = lookup(word);
    if (found) {
      const [english, kind] = found;
      if (english !== word) spanish = true;
      parts.push({ text: english, kind, at: position });
    } else {
      parts.push({ text: word, kind: "modifier", at: position });
    }
  }

  if (!spanish) return { text: query, translated: false };
  const ordered = (kind: Kind) =>
    parts
      .filter((part) => part.kind === kind)
      .sort((a, b) => a.at - b.at)
      .map((part) => part.text);
  const gender = ordered("gender")[0];
  const text = [...ordered("modifier"), ...ordered("noun")].join(" ");
  return {
    text: gender ? `${text} for ${gender}` : text,
    translated: true,
  };
}
