# Fashion Search

[![CI](https://github.com/solanodz/fashion-search/actions/workflows/ci.yml/badge.svg)](https://github.com/solanodz/fashion-search/actions/workflows/ci.yml)

**Live:** <https://fashion-search-mu.vercel.app>

Multimodal product search over a public fashion catalog: search by text, by
photo, or both at once ("this, but in blue"), with filters by gender, category
and color.

## How it works

- **Model:** CLIP (`Xenova/clip-vit-base-patch32`, MIT) through Transformers.js.
  The same model indexes the catalog and encodes queries, so images and text
  share one vector space.
- **Filters** by gender, category, type and colour are exact Qdrant payload
  filters with live counts (`/api/facets`).
- **Photo + text** ("this, but in blue") combines both vectors with the text
  weighted twice ([ADR 0007](docs/adr/0007-combined-queries.md)).
- **Hybrid search:** text queries also match product names with BM25 keyword
  vectors, fused with the CLIP results by rank
  ([ADR 0009](docs/adr/0009-hybrid-search.md)). Precision@10 on all
  attributes goes from 59% to 79%.
- **Embedding map:** every product projected to 3D with UMAP, with the query
  and its results highlighted ([ADR 0010](docs/adr/0010-embedding-map.md)).
- **Queries run in the visitor's browser.** The model turns the text or photo
  into a vector; the server only queries the vector database. No GPU server
  and no model API keys.
- **Vector database:** Qdrant. Local through Docker in development.
- **App:** Next.js (App Router), TypeScript, Tailwind CSS, deployed on Vercel
  (a preview per pull request, production on every merge to `main`).

## Data

[Fashion Product Images](https://www.kaggle.com/datasets/paramaggarwal/fashion-product-images-dataset)
by Param Aggarwal, MIT license: 42,426 products with photos and metadata.
Names, categories and colours come from the
[`ashraq/fashion-product-images-small`](https://huggingface.co/datasets/ashraq/fashion-product-images-small)
mirror, and the photos (up to 384×512) from
[`ceyda/fashion-products-small`](https://huggingface.co/datasets/ceyda/fashion-products-small)
([ADR 0008](docs/adr/0008-catalog-photos.md)). The 1,646 products without a
photo there are left out.

## Development

Requires Node 22 (see `.nvmrc`) and Docker.

```bash
npm install
npm run setup   # creates .env.local and starts Qdrant
npm run dev
```

Before the first E2E run, install the browser with
`npx playwright install --only-shell chromium`.

Qdrant runs in Docker (`docker-compose.yml`); its dashboard is at
<http://localhost:6333/dashboard>. Environment variables are documented in
[`.env.example`](.env.example) and validated at startup by `src/env.ts`.

| Script                     | What it does                                |
| -------------------------- | ------------------------------------------- |
| `npm run setup`            | Create `.env.local` and start Qdrant        |
| `npm run dev`              | Development server                          |
| `npm run dev:all`          | Start Qdrant, then the development server   |
| `npm run lint`             | ESLint, fails on warnings                   |
| `npm run typecheck`        | Generate route types, then TypeScript       |
| `npm run test`             | Unit tests (Vitest), single run             |
| `npm run test:watch`       | Unit tests in watch mode                    |
| `npm run test:integration` | Integration tests against a running Qdrant  |
| `npm run test:model`       | CLIP model tests (local only, downloads it) |
| `npm run test:e2e`         | E2E tests (Playwright, Chromium)            |
| `npm run test:e2e:ui`      | E2E tests in Playwright's UI mode           |
| `npm run format`           | Format every file with Prettier             |
| `npm run format:check`     | Check formatting without writing            |
| `npm run build`            | Production build                            |
| `npm run index:prepare`    | Dataset → catalog and images in `data/`     |
| `npm run index:embed`      | Catalog images → CLIP vectors in `data/`    |
| `npm run index:upload`     | Vectors → Qdrant, then move the alias       |
| `npm run index:images`     | Catalog images → Cloudflare R2 (resumable)  |
| `npm run index:map`        | 3D map of the embedding space (UMAP)        |
| `npm run index:eval`       | Retrieval quality report                    |
| `npm run db:up`            | Start Qdrant                                |
| `npm run db:down`          | Stop Qdrant, keep its data                  |
| `npm run db:reset`         | Stop Qdrant and delete its data             |

Every pull request runs lint, format check, typecheck, unit and integration
tests (against a Qdrant service container), E2E tests on a production build,
dependency review and build on
GitHub Actions. The PR title must follow Conventional Commits, since it becomes
the squash commit on `main`.

Git hooks (installed by `npm install` through Husky):

- **pre-commit:** ESLint and Prettier on staged files (lint-staged).
- **commit-msg:** commit messages must follow
  [Conventional Commits](https://www.conventionalcommits.org/) (commitlint).

## Indexing the catalog

The catalog is indexed locally in stages; outputs go to the git-ignored
`data/` directory (see [ADR 0006](docs/adr/0006-indexing-pipeline.md)).

```bash
npm run index:prepare   # download both datasets (868 MB), write data/catalog.jsonl and data/images/
npm run index:embed     # CLIP image vectors into data/embeddings/ (resumable)
npm run index:upload    # versioned Qdrant collection behind the "products" alias
npm run index:map       # 3D UMAP map of the image vectors into public/ (about 1 minute)
npm run index:eval      # retrieval quality report (precision@10)
```

`index:embed` downloads the CLIP model once (153.6 MB, cached in
`data/models/`) and runs at about 85 images/s on an Apple Silicon laptop, so
the full catalog takes roughly 9 minutes. Press Ctrl+C to stop after the
current batch; running it again continues where it stopped. Use `--fresh` to
start over.

`index:upload` creates the next `products_vN` collection, verifies the point
count, then moves the `products` alias to it in one atomic step; the app
always queries the alias. The previous version is kept for rollback and older
ones are deleted.

To index Qdrant Cloud, reuse the local vectors and pass a key with write
access only for this command (the app itself uses a read-only key):

```bash
QDRANT_URL=https://<cluster>.cloud.qdrant.io QDRANT_API_KEY=<write key> npm run index:upload -- --yes
```

### Images in production

Locally the app serves `data/images/` at `/images`. In production the images
live in a public Cloudflare R2 bucket
([ADR 0005](docs/adr/0005-image-hosting.md)), one object per product keyed
`<id>`. One-time setup in the Cloudflare dashboard:

1. Create a bucket and enable its public `r2.dev` URL (Settings → Public
   access).
2. Add a CORS rule so the browser can fetch images for "More like this":

   ```json
   [
     {
       "AllowedOrigins": [
         "https://fashion-search-mu.vercel.app",
         "http://localhost:3000"
       ],
       "AllowedMethods": ["GET"]
     }
   ]
   ```

3. Create an R2 API token with Object Read & Write on that bucket, and put
   `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and
   `R2_SECRET_ACCESS_KEY` in `.env.local` (never in Vercel).

Then upload the 42,426 images (about 655 MB). Objects already in the bucket
are skipped, so Ctrl+C and rerun is safe; `--dry-run` only counts:

```bash
npm run index:images
```

Finally set `NEXT_PUBLIC_IMAGE_BASE_URL` in Vercel to the bucket's public URL
(no trailing slash) and redeploy, since `NEXT_PUBLIC_*` values are inlined at
build time.

### Retrieval quality

Precision@10 over 27 text queries, without filters, with hybrid search:
article type 89%, colour 91%, gender 95%, all attributes 79% (image vectors
alone: 77%, 78%, 94%, 59%). History, details and known weak spots in
[docs/evaluation.md](docs/evaluation.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, testing strategy and
conventions, and [`docs/adr/`](docs/adr/) for architecture decisions.
Security issues: [SECURITY.md](SECURITY.md).

## Status

Search by text, by photo and combined, with filters, works locally. Next is
the production launch: Qdrant Cloud and image hosting ([project board](https://github.com/users/solanodz/projects/1)).

## License

[MIT](LICENSE). The dataset is also MIT licensed.
