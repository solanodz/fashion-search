/**
 * The single source of truth for the embedding model. The catalog (indexing)
 * and the queries (browser) must use exactly these values, or vectors stop
 * being comparable. Changing any of them requires re-indexing.
 */
export const CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32";

/** 8-bit quantized ONNX weights: vision_model_quantized.onnx (89 MB) and text_model_quantized.onnx (64.5 MB). */
export const CLIP_DTYPE = "q8";

export const CLIP_DIMENSIONS = 512;
