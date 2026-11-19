# Fashion Search

[![CI](https://github.com/solanodz/fashion-search/actions/workflows/ci.yml/badge.svg)](https://github.com/solanodz/fashion-search/actions/workflows/ci.yml)

Multimodal product search over a public fashion catalog: search by text, by
photo, or both at once ("this, but in blue"), with filters by gender, category
and color.

## How it works

- **Model:** CLIP (`Xenova/clip-vit-base-patch32`, MIT) through Transformers.js.
  The same model indexes the catalog and encodes queries, so images and text
  share one vector space.
- **Queries run in the visitor's browser.** The model turns the text or photo
  into a vector; the server only queries the vector database. No GPU server
  and no model API keys.
- **Vector database:** Qdrant. Local through Docker in development.
- **App:** Next.js (App Router), TypeScript, Tailwind CSS.

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

Qdrant runs in Docker (`docker-compose.yml`); its dashboard is at
<http://localhost:6333/dashboard>. Environment variables are documented in
[`.env.example`](.env.example) and validated at startup by `src/env.ts`.

| Script                     | What it does                               |
| -------------------------- | ------------------------------------------ |
| `npm run setup`            | Create `.env.local` and start Qdrant       |
| `npm run dev`              | Development server                         |
| `npm run dev:all`          | Start Qdrant, then the development server  |
| `npm run lint`             | ESLint, fails on warnings                  |
| `npm run typecheck`        | Generate route types, then TypeScript      |
| `npm run test`             | Unit tests (Vitest), single run            |
| `npm run test:watch`       | Unit tests in watch mode                   |
| `npm run test:integration` | Integration tests against a running Qdrant |
| `npm run format`           | Format every file with Prettier            |
| `npm run format:check`     | Check formatting without writing           |
| `npm run build`            | Production build                           |
| `npm run db:up`            | Start Qdrant                               |
| `npm run db:down`          | Stop Qdrant, keep its data                 |
| `npm run db:reset`         | Stop Qdrant and delete its data            |

Every pull request runs lint, format check, typecheck, unit and integration
tests (against a Qdrant service container), dependency review and build on
GitHub Actions. The PR title must follow Conventional Commits, since it becomes
the squash commit on `main`.

Git hooks (installed by `npm install` through Husky):

- **pre-commit:** ESLint and Prettier on staged files (lint-staged).
- **commit-msg:** commit messages must follow
  [Conventional Commits](https://www.conventionalcommits.org/) (commitlint).

## Status

Scaffolded. Workflow, CI/CD, indexing and search are not built yet.
