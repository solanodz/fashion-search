/**
 * Fashion Product Images (Small), MIT license.
 * Original: https://www.kaggle.com/datasets/paramaggarwal/fashion-product-images-small
 * Mirror pinned to a commit so every run reads the same bytes.
 */
export const DATASET = {
  repo: "ashraq/fashion-product-images-small",
  revision: "3859c76db2f6f3d3b9a3863345e3ccdbff75879d",
  expectedRows: 44_072,
  files: [
    {
      path: "data/train-00000-of-00002-6cff4c59f91661c3.parquet",
      size: 136_091_680,
    },
    {
      path: "data/train-00001-of-00002-bb459e5ac5f01e71.parquet",
      size: 135_404_761,
    },
  ],
} as const;

export function datasetFileUrl(path: string): string {
  return `https://huggingface.co/datasets/${DATASET.repo}/resolve/${DATASET.revision}/${path}`;
}
