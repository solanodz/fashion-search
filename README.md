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
- **Photo + text** ("this, but in blue") combines both vectors with the text
  weighted twice ([ADR 0007](docs/adr/0007-combined-queries.md)).
- **Queries run in the visitor's browser.** The model turns the text or photo
  into a vector; the server only queries the vector database. No GPU server
  and no model API keys.
- **Vector database:** Qdrant. Local through Docker in development.
- **App:** Next.js (App Router), TypeScript, Tailwind CSS, deployed on Vercel
  (a preview per pull request, production on every merge to `main`).

## Data

[Fashion Product Images (Small)](https://www.kaggle.com/datasets/paramaggarwal/fashion-product-images-small),
44,072 products with images and metadata, MIT license. Loaded from the
[Hugging Face mirror](https://huggingface.co/datasets/ashraq/fashion-product-images-small).

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
npm run index:prepare   # download the dataset (271.5 MB), write data/catalog.jsonl and data/images/
npm run index:embed     # CLIP image vectors into data/embeddings/ (resumable)
npm run index:upload    # versioned Qdrant collection behind the "products" alias
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

### Retrieval quality

Baseline precision@10 over 27 text queries, without filters: article type
79%, colour 75%, gender 93%, all attributes 57%. Details and known weak spots
in [docs/evaluation.md](docs/evaluation.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, testing strategy and
conventions, and [`docs/adr/`](docs/adr/) for architecture decisions.
Security issues: [SECURITY.md](SECURITY.md).

## Status

Development workflow, CI, local environment and catalog indexing are in
place. The search UI is next ([project board](https://github.com/users/solanodz/projects/1)).

## License

[MIT](LICENSE). The dataset is also MIT licensed.
