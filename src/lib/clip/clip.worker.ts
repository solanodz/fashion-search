/// <reference lib="webworker" />
import { env } from "@huggingface/transformers";

import { embedTexts } from "./encoder.ts";

/**
 * Runs CLIP off the main thread so typing and scrolling stay smooth while the
 * model downloads and runs. Messages: see client.ts.
 */

// Models come from the Hugging Face Hub; there is no local /models folder.
env.allowLocalModels = false;

export type WorkerRequest = { id: number; type: "text"; text: string };

export type WorkerResponse =
  | { id: number; type: "result"; vector: Float32Array }
  | { id: number; type: "error"; message: string }
  | { type: "progress"; file: string; loaded: number; total: number };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: WorkerResponse, transfer: Transferable[] = []) =>
  scope.postMessage(message, transfer);

scope.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    const [vector] = await embedTexts([data.text], {
      onProgress: (event) => post({ type: "progress", ...event }),
    });
    post({ id: data.id, type: "result", vector }, [vector.buffer]);
  } catch (error) {
    post({
      id: data.id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
