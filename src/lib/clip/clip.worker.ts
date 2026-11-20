/// <reference lib="webworker" />
import { env, RawImage } from "@huggingface/transformers";

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
    };

/** Occluded copies encoded per model call: fewer calls, bounded memory. */
const EXPLAIN_BATCH = 7;

export type WorkerResponse =
  | { id: number; type: "result"; vector: Float32Array }
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

scope.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
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
