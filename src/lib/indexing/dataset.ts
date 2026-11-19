/**
 * Source datasets, each pinned to a commit so every run reads the same bytes.
 * Both derive from Fashion Product Images by Param Aggarwal (MIT license):
 * https://www.kaggle.com/datasets/paramaggarwal/fashion-product-images-dataset
 */

export type HfDataset = {
  repo: string;
  revision: string;
  expectedRows: number;
  files: readonly { path: string; size: number }[];
};

/** Product metadata (names, categories, colours). Its images are 60×80 and unused. */
export const METADATA_DATASET = {
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
} as const satisfies HfDataset;

/** Product photos resized to at most 512 px (384×512 for most), keyed by the same ids. */
export const IMAGE_DATASET = {
  repo: "ceyda/fashion-products-small",
  revision: "ef520080129df6ec7fda0df347b5f7eacdf0dc1c",
  expectedRows: 42_700,
  files: [
    {
      path: "data/train-00000-of-00002-357f4cbabe1a8ea6.parquet",
      size: 297_859_218,
    },
    {
      path: "data/train-00001-of-00002-cbe936f1880f5e72.parquet",
      size: 298_715_145,
    },
  ],
} as const satisfies HfDataset;

export function datasetFileUrl(dataset: HfDataset, path: string): string {
  return `https://huggingface.co/datasets/${dataset.repo}/resolve/${dataset.revision}/${path}`;
}
