/** One product as stored in data/catalog.jsonl and as the Qdrant payload. */
export type CatalogItem = {
  id: number;
  name: string;
  gender: string;
  masterCategory: string;
  subCategory: string;
  articleType: string;
  baseColour: string | null;
  season: string | null;
  year: number | null;
  usage: string | null;
};

/** Metadata columns read from the parquet files (everything except the image). */
export const METADATA_COLUMNS = [
  "id",
  "productDisplayName",
  "gender",
  "masterCategory",
  "subCategory",
  "articleType",
  "baseColour",
  "season",
  "year",
  "usage",
] as const;

/** A parquet row as returned by the reader: column name to raw value. */
export type RawRow = Record<string, unknown>;

export type NormalizeResult =
  { ok: true; item: CatalogItem } | { ok: false; reason: string };

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" || trimmed.toUpperCase() === "NA" ? null : trimmed;
}

function integer(value: unknown): number | null {
  const number = typeof value === "bigint" ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number)
    ? number
    : null;
}

/** Validates and cleans one parquet row. Required fields missing → the row is skipped. */
export function normalizeRow(row: RawRow): NormalizeResult {
  const id = integer(row.id);
  if (id === null || id <= 0) return { ok: false, reason: "invalid id" };

  const name = text(row.productDisplayName);
  const gender = text(row.gender);
  const masterCategory = text(row.masterCategory);
  const subCategory = text(row.subCategory);
  const articleType = text(row.articleType);
  if (!name || !gender || !masterCategory || !subCategory || !articleType) {
    return { ok: false, reason: "missing required field" };
  }

  const year =
    typeof row.year === "number" && Number.isFinite(row.year)
      ? Math.trunc(row.year)
      : null;

  return {
    ok: true,
    item: {
      id,
      name,
      gender,
      masterCategory,
      subCategory,
      articleType,
      baseColour: text(row.baseColour),
      season: text(row.season),
      year,
      usage: text(row.usage),
    },
  };
}

/** Product id of a photo row; the image dataset stores it as text ("15970"). */
export function parseImageId(value: unknown): number | null {
  const id =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : integer(value);
  return id !== null && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** JPEG files start with the SOI marker FF D8 FF. */
export function isJpeg(
  bytes: Uint8Array | undefined | null,
): bytes is Uint8Array {
  return (
    !!bytes &&
    bytes.length > 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}
