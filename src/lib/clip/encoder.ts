import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
} from "@huggingface/transformers";

import { CLIP_DIMENSIONS, CLIP_DTYPE, CLIP_MODEL_ID } from "./config";
import { splitRows } from "./vector";

/**
 * CLIP encoders shared by the indexing scripts (Node) and the search UI
 * (browser). The text and vision halves load lazily and independently, so a
 * text search never downloads the vision weights. Returned vectors are
 * L2-normalized Float32Arrays of CLIP_DIMENSIONS values.
 */

export { RawImage };

/** Reports model file download progress (0-100) per file. */
export type ProgressCallback = (event: {
  file: string;
  progress: number;
}) => void;

type LoadOptions = { onProgress?: ProgressCallback };

function progressHandler(onProgress?: ProgressCallback) {
  if (!onProgress) return undefined;
  return (info: { status: string; file?: string; progress?: number }) => {
    if (info.status === "progress" && info.file)
      onProgress({ file: info.file, progress: info.progress ?? 0 });
  };
}

let textEncoder: ReturnType<typeof loadTextEncoder> | undefined;
let visionEncoder: ReturnType<typeof loadVisionEncoder> | undefined;

async function loadTextEncoder(options: LoadOptions) {
  const progress_callback = progressHandler(options.onProgress);
  const [tokenizer, model] = await Promise.all([
    AutoTokenizer.from_pretrained(CLIP_MODEL_ID, { progress_callback }),
    CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL_ID, {
      dtype: CLIP_DTYPE,
      progress_callback,
    }),
  ]);
  return { tokenizer, model };
}

async function loadVisionEncoder(options: LoadOptions) {
  const progress_callback = progressHandler(options.onProgress);
  const [processor, model] = await Promise.all([
    AutoProcessor.from_pretrained(CLIP_MODEL_ID, { progress_callback }),
    CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL_ID, {
      dtype: CLIP_DTYPE,
      progress_callback,
    }),
  ]);
  return { processor, model };
}

/** Loads (once) the text half of CLIP. Safe to call repeatedly. */
export function getTextEncoder(options: LoadOptions = {}) {
  textEncoder ??= loadTextEncoder(options).catch((error) => {
    textEncoder = undefined;
    throw error;
  });
  return textEncoder;
}

/** Loads (once) the vision half of CLIP. Safe to call repeatedly. */
export function getVisionEncoder(options: LoadOptions = {}) {
  visionEncoder ??= loadVisionEncoder(options).catch((error) => {
    visionEncoder = undefined;
    throw error;
  });
  return visionEncoder;
}

export async function embedTexts(
  texts: string[],
  options: LoadOptions = {},
): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const { tokenizer, model } = await getTextEncoder(options);
  const inputs = tokenizer(texts, { padding: true, truncation: true });
  const { text_embeds } = await model(inputs);
  return splitRows(text_embeds.data, texts.length, CLIP_DIMENSIONS);
}

export async function embedImages(
  images: RawImage[],
  options: LoadOptions = {},
): Promise<Float32Array[]> {
  if (images.length === 0) return [];
  const { processor, model } = await getVisionEncoder(options);
  const inputs = await processor(images);
  const { image_embeds } = await model(inputs);
  return splitRows(image_embeds.data, images.length, CLIP_DIMENSIONS);
}
