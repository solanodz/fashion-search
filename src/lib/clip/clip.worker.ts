/// <reference lib="webworker" />
import { env, RawImage } from "@huggingface/transformers";

import { embedImages, embedTexts } from "./encoder.ts";

/**
 * Runs CLIP off the main thread so typing and scrolling stay smooth while the
 * models download and run. Text and photo requests load only the half of the
 * model they need. Messages: see client.ts.
 */

// Models come from the Hugging Face Hub; there is no local /models folder.
env.allowLocalModels = false;

export type WorkerRequest =
  | { id: number; type: "text"; text: string }
  | { id: number; type: "image"; image: Blob };

export type WorkerResponse =
  | { id: number; type: "result"; vector: Float32Array }
  | { id: number; type: "error"; message: string }
  | { type: "progress"; file: string; loaded: number; total: number };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: WorkerResponse, transfer: Transferable[] = []) =>
  scope.postMessage(message, transfer);
const onProgress = (event: { file: string; loaded: number; total: number }) =>
  post({ type: "progress", ...event });

scope.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    let vector: Float32Array;
    if (data.type === "text") {
      [vector] = await embedTexts([data.text], { onProgress });
    } else {
      let image: RawImage;
      try {
        image = await RawImage.fromBlob(data.image);
      } catch {
        throw new Error(
          "This file could not be read as an image. Try a JPEG, PNG or WebP photo.",
        );
      }
      [vector] = await embedImages([image], { onProgress });
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
