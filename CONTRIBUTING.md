# Contributing

This project runs like a small product team: every change goes through an
issue, a short-lived branch, a pull request and green CI.

## Setup

Requires Node 22 (`.nvmrc`) and Docker.

```bash
npm install                                   # also installs Git hooks
npm run setup                                 # .env.local + local Qdrant
npx playwright install --only-shell chromium  # once, for E2E tests
npm run dev
```

## Workflow

1. **Issue first.** Use a template (feature, bug or task). It lands on the
   [project board](https://github.com/users/solanodz/projects/1).
2. **Branch from `main`** as `type/issue-short-description`, for example
   `feat/12-text-search` or `fix/31-color-filter`. Types match the commit types
   below; the PR gets its `type:*` label from the prefix.
3. **Commit** with [Conventional Commits](https://www.conventionalcommits.org/):
   `feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `docs:`, `build:`, `ci:`,
   `chore:`, `revert:`. The `commit-msg` hook checks it.
4. **Open a PR** with a Conventional Commit title and `Closes #N` in the body.
   PRs are squash-merged, so the title becomes the commit on `main` and the
   changelog entry.
5. **Merge when green.** `main` is protected: no direct pushes, and the
   `CI OK` and `Conventional PR title` checks must pass with the branch up to
   date.

Keep PRs small: one concern per PR is easier to review, test and revert.

## Tests

| Kind        | Tool                     | Where                          | What it covers                                       |
| ----------- | ------------------------ | ------------------------------ | ---------------------------------------------------- |
| Unit        | Vitest + Testing Library | `src/**/*.test.ts(x)`          | Pure logic and client components                     |
| Integration | Vitest + real Qdrant     | `src/**/*.integration.test.ts` | Server code against Qdrant with tiny fixture vectors |
| E2E         | Playwright (Chromium)    | `e2e/`                         | User flows on a production build                     |

Async Server Components can't be unit tested yet; cover them with E2E tests.
Tests never download the CLIP model: integration tests use precomputed vectors
and E2E tests will use a stub encoder.

```bash
npm test                  # unit
npm run db:up && npm run test:integration
npm run test:e2e
```

## Environment and secrets

- Every variable is documented in `.env.example` and validated in `src/env.ts`.
  Add new ones in both places.
- Never commit secrets. `.env.local` is git-ignored and GitHub push protection
  blocks known credential formats.
- Server-only variables must not use the `NEXT_PUBLIC_` prefix.

## Architecture decisions

Significant decisions are recorded as ADRs in [`docs/adr/`](docs/adr/). Copy
[`template.md`](docs/adr/template.md), take the next number, and include the
ADR in the PR that implements the decision.
