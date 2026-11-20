import "server-only";

/** Server entry point for product search; the logic lives in query.ts (ADR 0009). */
export {
  cosine,
  denseVector,
  runSearch as searchProducts,
  runSearchWithLists,
  toQdrantFilter,
} from "./query";
