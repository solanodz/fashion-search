import { join } from "node:path";

import { env } from "@huggingface/transformers";

import { RawImage } from "./encoder.ts";

/**
 * Node-only setup for the CLIP encoders: keep downloaded model files in the
 * git-ignored data/models directory instead of node_modules, so reinstalling
 * dependencies does not download the model again.
 */
env.cacheDir = join(process.cwd(), "data", "models");

export function readImageFile(path: string): Promise<RawImage> {
  return RawImage.read(path);
}

export * from "./encoder.ts";
