import { existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  open,
  readFile,
  rm,
  stat,
  truncate,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

/**
 * Append-only, resumable storage for catalog embeddings:
 *
 *   manifest.json  model settings the vectors were computed with
 *   vectors.f32    float32 little-endian, one row of `dimensions` values per product
 *   ids.u32        uint32 little-endian product ids, same order as vectors
 *
 * Each batch appends vectors first and ids last, so a crash leaves at most one
 * extra vector row, which `open` truncates. A product counts as done only once
 * its id is written.
 */

export type EmbeddingsManifest = {
  model: string;
  dtype: string;
  dimensions: number;
};

const MANIFEST = "manifest.json";
const VECTORS = "vectors.f32";
const IDS = "ids.u32";

export class EmbeddingsStore {
  readonly dir: string;
  readonly manifest: EmbeddingsManifest;
  private rows: number;

  // Plain fields instead of parameter properties: Node's type stripping can't run those.
  private constructor(dir: string, manifest: EmbeddingsManifest, rows: number) {
    this.dir = dir;
    this.manifest = manifest;
    this.rows = rows;
  }

  /** Opens (or creates) a store. Fails if it holds vectors from a different model. */
  static async open(
    dir: string,
    manifest: EmbeddingsManifest,
  ): Promise<EmbeddingsStore> {
    await mkdir(dir, { recursive: true });
    const manifestPath = join(dir, MANIFEST);

    if (existsSync(manifestPath)) {
      const stored = JSON.parse(
        await readFile(manifestPath, "utf8"),
      ) as EmbeddingsManifest;
      if (
        stored.model !== manifest.model ||
        stored.dtype !== manifest.dtype ||
        stored.dimensions !== manifest.dimensions
      ) {
        throw new Error(
          `${dir} holds vectors from ${stored.model} (${stored.dtype}, ${stored.dimensions} dims), ` +
            `not ${manifest.model} (${manifest.dtype}, ${manifest.dimensions} dims). Start over with --fresh.`,
        );
      }
    } else {
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    }

    const rowBytes = manifest.dimensions * 4;
    const vectorRows = Math.floor(
      (await sizeOf(join(dir, VECTORS))) / rowBytes,
    );
    const idRows = Math.floor((await sizeOf(join(dir, IDS))) / 4);
    const rows = Math.min(vectorRows, idRows);

    // Drop partial writes from an interrupted batch.
    await truncateTo(join(dir, VECTORS), rows * rowBytes);
    await truncateTo(join(dir, IDS), rows * 4);

    return new EmbeddingsStore(dir, manifest, rows);
  }

  static async remove(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true });
  }

  get count(): number {
    return this.rows;
  }

  async ids(): Promise<Uint32Array> {
    const buffer = await readOrEmpty(join(this.dir, IDS));
    return new Uint32Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / 4,
    ).slice();
  }

  async append(ids: number[], vectors: Float32Array[]): Promise<void> {
    if (ids.length !== vectors.length)
      throw new Error("ids and vectors must have the same length");
    const { dimensions } = this.manifest;
    const flat = new Float32Array(ids.length * dimensions);
    vectors.forEach((vector, row) => {
      if (vector.length !== dimensions)
        throw new Error(`Expected ${dimensions} dims, got ${vector.length}`);
      flat.set(vector, row * dimensions);
    });
    await appendFile(join(this.dir, VECTORS), toBytes(flat));
    await appendFile(join(this.dir, IDS), toBytes(Uint32Array.from(ids)));
    this.rows += ids.length;
  }

  /** Reads every stored row as [id, vector] pairs. */
  async readAll(): Promise<{ id: number; vector: Float32Array }[]> {
    const ids = await this.ids();
    const buffer = await readOrEmpty(join(this.dir, VECTORS));
    const values = new Float32Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / 4,
    );
    const { dimensions } = this.manifest;
    return Array.from(ids, (id, row) => ({
      id,
      vector: values.slice(row * dimensions, (row + 1) * dimensions),
    }));
  }
}

function toBytes(array: Float32Array | Uint32Array): Uint8Array {
  if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) {
    throw new Error("Big-endian platforms are not supported");
  }
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}

async function sizeOf(path: string): Promise<number> {
  return existsSync(path) ? (await stat(path)).size : 0;
}

async function truncateTo(path: string, bytes: number): Promise<void> {
  if (!existsSync(path)) {
    await (await open(path, "w")).close();
    return;
  }
  if ((await stat(path)).size !== bytes) await truncate(path, bytes);
}

async function readOrEmpty(path: string): Promise<Buffer> {
  // Copy into an aligned buffer: typed array views need 4-byte alignment.
  const data = existsSync(path) ? await readFile(path) : Buffer.alloc(0);
  const aligned = Buffer.alloc(data.byteLength);
  data.copy(aligned);
  return aligned;
}
