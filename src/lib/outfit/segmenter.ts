import {
  type ImageSegmentationPipeline,
  pipeline,
  type RawImage,
} from "@huggingface/transformers";

import { type ProgressCallback, progressHandler } from "../clip/encoder.ts";
import { SEGMENTER_DTYPE, SEGMENTER_MODEL_ID } from "./config.ts";
import type { LabelMask } from "./garments.ts";

/** Clothes segmentation, loaded once on first use (retried after a failure). */
let segmenter: Promise<ImageSegmentationPipeline> | undefined;

export async function segmentClothes(
  image: RawImage,
  options: { onProgress?: ProgressCallback } = {},
): Promise<LabelMask[]> {
  if (!segmenter) {
    segmenter = pipeline("image-segmentation", SEGMENTER_MODEL_ID, {
      dtype: SEGMENTER_DTYPE,
      progress_callback: progressHandler(options.onProgress),
    }) as Promise<ImageSegmentationPipeline>;
    segmenter.catch(() => {
      segmenter = undefined;
    });
  }
  const segments = await (await segmenter)(image);
  return segments.map((s) => ({ label: s.label ?? "", mask: s.mask.data }));
}
