/// <reference lib="webworker" />
import { env, RawImage } from "@huggingface/transformers";

import {
  colourPrompts,
  type Reading,
  readGarment,
  typePrompts,
} from "../outfit/attributes.ts";
import { cutOut, garmentRegions } from "../outfit/garments.ts";
import { segmentClothes } from "../outfit/segmenter.ts";
import { embedImages, embedTexts } from "./encoder.ts";
import { gridCells, importance, occlude } from "./occlusion.ts";
import { dot } from "./vector.ts";

/**
 * Runs CLIP off the main thread so typing and scrolling stay smooth while the
 * models download and run. Text and photo requests load only the half of the
 * model they need. Messages: see client.ts.
 */

// Models come from the Hugging Face Hub; there is no local /models folder.
env.allowLocalModels = false;

export type WorkerRequest =
  | { id: number; type: "text"; text: string }
  | { id: number; type: "image"; image: Blob }
  | {
      id: number;
      type: "explain";
      image: Blob;
      query: Float32Array;
      cols: number;
      rows: number;
    }
  | { id: number; type: "outfit"; image: Blob };

/** A garment found in a photo of a person, cut out and encoded. */
export type FoundGarment = {
  key: string;
  /** Bounds in the photo, as fractions of its width and height. */
  box: { x0: number; y0: number; x1: number; y1: number };
  share: number;
  vector: Float32Array;
  /** Colour and type read off the cut-out by CLIP (attributes.ts). */
  reading: Reading;
  /** The searched crop, as RGBA pixels for a canvas. */
  cutout: { data: Uint8ClampedArray; width: number; height: number };
};

/** Occluded copies encoded per model call: fewer calls, bounded memory. */
const EXPLAIN_BATCH = 7;

export type WorkerResponse =
  | { id: number; type: "result"; vector: Float32Array }
  | { id: number; type: "outfit"; garments: FoundGarment[] }
  | { id: number; type: "error"; message: string }
  | { type: "progress"; file: string; loaded: number; total: number };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: WorkerResponse, transfer: Transferable[] = []) =>
  scope.postMessage(message, transfer);
const onProgress = (event: { file: string; loaded: number; total: number }) =>
  post({ type: "progress", ...event });

async function readImage(blob: Blob): Promise<RawImage> {
  try {
    return await RawImage.fromBlob(blob);
  } catch {
    throw new Error(
      "This file could not be read as an image. Try a JPEG, PNG or WebP photo.",
    );
  }
}

/**
 * Importance of each grid cell of a photo for its match with the query
 * (see occlusion.ts), returned in the result's `vector` field.
 */
async function explain(
  data: Extract<WorkerRequest, { type: "explain" }>,
): Promise<Float32Array> {
  const image = await readImage(data.image);
  const { width, height, channels } = image;
  const variants = gridCells(width, height, data.cols, data.rows).map(
    (cell) =>
      new RawImage(
        occlude(image.data, width, channels, cell),
        width,
        height,
        channels,
      ),
  );
  const [original] = await embedImages([image], { onProgress });
  const similarities: number[] = [];
  for (let i = 0; i < variants.length; i += EXPLAIN_BATCH) {
    const vectors = await embedImages(variants.slice(i, i + EXPLAIN_BATCH), {
      onProgress,
    });
    for (const vector of vectors) similarities.push(dot(vector, data.query));
  }
  return importance(dot(original, data.query), similarities);
}

/** Text vectors of the zero-shot prompts, encoded once per worker. */
const promptVectors = new Map<string, Float32Array>();

async function encodePrompts(prompts: string[]): Promise<Float32Array[]> {
  const missing = prompts.filter((p) => !promptVectors.has(p));
  if (missing.length > 0) {
    const vectors = await embedTexts(missing, { onProgress });
    missing.forEach((p, i) => promptVectors.set(p, vectors[i]));
  }
  return prompts.map((p) => promptVectors.get(p)!);
}

/** Every garment in a photo of a person, cut out and encoded (ADR 0013). */
async function outfit(blob: Blob): Promise<FoundGarment[]> {
  // RGB up front: the segmentation pipeline converts the image in place, so
  // its channel count would change under us.
  const image = (await readImage(blob)).rgb();
  const { width, height, channels } = image;
  const regions = garmentRegions(
    await segmentClothes(image, { onProgress }),
    width,
    height,
  );
  const cutouts = regions.map((region) =>
    cutOut(image.data, width, height, channels, region),
  );
  const vectors = await embedImages(
    cutouts.map((c) => new RawImage(c.data, c.width, c.height, 3)),
    { onProgress },
  );
  const readings: Reading[] = [];
  for (const [i, region] of regions.entries()) {
    const key = region.garment.key;
    readings.push(
      readGarment(
        key,
        vectors[i],
        await encodePrompts(colourPrompts(key)),
        await encodePrompts(typePrompts(key)),
      ),
    );
  }
  return regions.map((region, i) => {
    const { data, width: w, height: h } = cutouts[i];
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      rgba.set(data.subarray(p * 3, p * 3 + 3), p * 4);
      rgba[p * 4 + 3] = 255;
    }
    return {
      key: region.garment.key,
      box: {
        x0: region.box.x0 / width,
        y0: region.box.y0 / height,
        x1: region.box.x1 / width,
        y1: region.box.y1 / height,
      },
      share: region.share,
      vector: vectors[i],
      reading: readings[i],
      cutout: { data: rgba, width: w, height: h },
    };
  });
}

scope.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    if (data.type === "outfit") {
      const garments = await outfit(data.image);
      post(
        { id: data.id, type: "outfit", garments },
        garments.flatMap((g) => [g.vector.buffer, g.cutout.data.buffer]),
      );
      return;
    }
    let vector: Float32Array;
    if (data.type === "text") {
      [vector] = await embedTexts([data.text], { onProgress });
    } else if (data.type === "explain") {
      vector = await explain(data);
    } else {
      [vector] = await embedImages([await readImage(data.image)], {
        onProgress,
      });
    }
    post({ id: data.id, type: "result", vector }, [vector.buffer]);
  } catch (error) {
    post({
      id: data.id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
