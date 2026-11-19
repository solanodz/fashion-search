# 0005. Host catalog images in production

- **Status:** Proposed
- **Date:** 2026-11-19

## Context

Results show product images from the dataset (~44,000 small JPEGs, a few
hundred MB). They must be served fast and for free from a stable URL. Local
development can serve them from disk.

## Options considered

1. **Vercel Blob:** integrated with the deploy platform, but the free tier's
   storage and transfer limits are tight for this catalog.
2. **Cloudflare R2:** 10 GB free storage and no egress fees; needs a separate
   account and a public bucket or custom domain.
3. **Commit images to `public/`:** simplest, but bloats the repository and
   every deploy.

## Decision

Pending. Leaning towards Cloudflare R2 because egress is free. To be decided
before the production deploy (milestone M3).

## Consequences

To be filled in when the decision is made.
