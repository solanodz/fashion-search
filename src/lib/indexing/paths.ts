import { join } from "node:path";

/** Local data layout for the indexing pipeline. Everything under data/ is git-ignored. */
export const DATA_DIR = join(process.cwd(), "data");
export const RAW_DIR = join(DATA_DIR, "raw");
export const IMAGES_DIR = join(DATA_DIR, "images");
export const CATALOG_FILE = join(DATA_DIR, "catalog.jsonl");
