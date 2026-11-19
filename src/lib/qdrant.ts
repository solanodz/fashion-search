import "server-only";

import { QdrantClient } from "@qdrant/js-client-rest";

import { serverEnv } from "@/env";

let client: QdrantClient | undefined;

/** Shared Qdrant client configured from server environment variables. */
export function qdrant(): QdrantClient {
  if (!client) {
    const { QDRANT_URL, QDRANT_API_KEY } = serverEnv();
    client = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY });
  }
  return client;
}
