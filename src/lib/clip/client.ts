import type {
  FoundGarment,
  WorkerRequest,
  WorkerResponse,
} from "./clip.worker.ts";

export type { FoundGarment };

/**
 * Browser-side handle to the CLIP worker. One worker per tab, created on first
 * use; the model is downloaded once and then served from the browser cache.
 */

export type ModelProgress = { loaded: number; total: number };

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (value: never) => void; reject: (error: Error) => void }
>();
const files = new Map<string, ModelProgress>();
const progressListeners = new Set<(progress: ModelProgress) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./clip.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
    if (data.type === "progress") {
      files.set(data.file, { loaded: data.loaded, total: data.total });
      const total = [...files.values()].reduce(
        (sum, file) => ({
          loaded: sum.loaded + file.loaded,
          total: sum.total + file.total,
        }),
        { loaded: 0, total: 0 },
      );
      progressListeners.forEach((listener) => listener(total));
      return;
    }
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.type === "result") request.resolve(data.vector as never);
    else if (data.type === "outfit") request.resolve(data.garments as never);
    else request.reject(new Error(data.message));
  };
  return worker;
}

/** Subscribes to model download progress. Returns an unsubscribe function. */
export function onModelProgress(
  listener: (progress: ModelProgress) => void,
): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

/**
 * E2E tests build with NEXT_PUBLIC_CLIP_STUB=1 to skip the 64 MB model: queries
 * become a fixed unit vector. The flag is inlined at build time, so production
 * bundles drop this branch.
 */
const STUB = process.env.NEXT_PUBLIC_CLIP_STUB === "1";

function stubVector(axis: number): Promise<Float32Array> {
  const vector = new Float32Array(512);
  vector[axis] = 1;
  return Promise.resolve(vector);
}

type Request = WorkerRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, "id">
    : never
  : never;

function send<T = Float32Array>(request: Request): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (value: never) => void,
      reject,
    });
    getWorker().postMessage({ id, ...request } as WorkerRequest);
  });
}

export function encodeText(text: string): Promise<Float32Array> {
  return STUB ? stubVector(0) : send({ type: "text", text });
}

/** Encodes a photo (any format the browser can decode). Loads the vision model on first use. */
export function encodeImage(image: Blob): Promise<Float32Array> {
  return STUB ? stubVector(1) : send({ type: "image", image });
}

/**
 * Finds the garments in a photo of a person and encodes each one cut out on
 * white. Downloads the segmentation and vision models on first use.
 */
export function findGarments(image: Blob): Promise<FoundGarment[]> {
  if (STUB) return Promise.resolve(stubGarments());
  return send<FoundGarment[]>({ type: "outfit", image });
}

/** A top and a bottom, for E2E tests built without the models. */
function stubGarments(): FoundGarment[] {
  const garment = (
    key: string,
    axis: number,
    box: FoundGarment["box"],
  ): FoundGarment => {
    const vector = new Float32Array(512);
    vector[axis] = 1;
    return {
      key,
      box,
      share: 0.2,
      vector,
      reading: {
        colour: "Blue",
        colourConfidence: 0.5,
        type: null,
        typeConfidence: 1,
        text: `Blue ${key}`,
      },
      cutout: {
        data: new Uint8ClampedArray(3 * 4 * 4).fill(200),
        width: 3,
        height: 4,
      },
    };
  };
  return [
    garment("top", 2, { x0: 0.25, y0: 0.2, x1: 0.75, y1: 0.5 }),
    garment("bottom", 3, { x0: 0.3, y0: 0.5, x1: 0.7, y1: 0.95 }),
  ];
}

/** Starts downloading the text model before the first search. */
export function warmUpTextModel(): void {
  if (STUB) return;
  encodeText("warm up").catch(() => {});
}
