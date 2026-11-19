# 0005. Host catalog images in production

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Results show product images from the dataset: 44,072 JPEGs, about 563 MB in
total (12.8 KB on average). They must be served fast and for free from a
stable URL. Local development serves them from disk through `/images/[id]`.

The browser also downloads a product's image with `fetch` for "More like
this", so the store must send CORS headers for the site's origin.

## Options considered

1. **Vercel Blob:** integrated with the deploy platform, but the free tier's
   transfer allowance is small for an image-heavy page, and overages are
   billed.
2. **Cloudflare R2:** 10 GB free storage, 1 million free writes a month and no
   egress fees. Needs a separate account and a public bucket.
3. **Commit images to `public/`:** simplest, but adds 563 MB to the repository
   and to every deploy.

## Decision

Cloudflare R2. One public bucket holds one object per product, keyed by its
id with no extension (`<id>`), with `Content-Type: image/jpeg` and an
immutable one-year cache header. `NEXT_PUBLIC_IMAGE_BASE_URL` points at the
bucket's public URL; when it is unset the app falls back to `/images`.

`npm run index:images` uploads the images through R2's S3-compatible API,
signed with `aws4fetch`. It skips objects already in the bucket, so it can be
stopped and rerun.

The bucket is served from its `r2.dev` public URL to start with. Cloudflare
rate-limits that URL and recommends a custom domain for production traffic,
which needs a domain on Cloudflare. A portfolio's traffic fits the `r2.dev`
limits; moving to a custom domain later only changes the environment variable.

## Consequences

- Images cost nothing to serve, and the deploy stays small.
- A Cloudflare account, a bucket, an API token and a CORS rule are manual
  setup steps, documented in the README.
- The image URL scheme (`<base>/<id>`) is a contract between the bucket and
  the UI; changing it means re-uploading or keeping both.
