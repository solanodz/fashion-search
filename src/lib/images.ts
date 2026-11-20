/**
 * Where product photos are served from: the R2 bucket in production
 * (ADR 0005), the local /images route otherwise. `||` so an empty value
 * copied from .env.example still falls back.
 */
export const IMAGE_BASE_URL =
  process.env.NEXT_PUBLIC_IMAGE_BASE_URL || "/images";
