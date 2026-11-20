/**
 * Clothes segmentation model for the outfit search (ADR 0013): SegFormer-B2
 * fine-tuned on the ATR human parsing dataset. 8-bit quantized ONNX weights,
 * model_quantized.onnx (28.8 MB). Released under NVIDIA's SegFormer licence,
 * for non-commercial use.
 */
export const SEGMENTER_MODEL_ID = "Xenova/segformer_b2_clothes";

export const SEGMENTER_DTYPE = "q8";
