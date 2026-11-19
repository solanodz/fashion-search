# 0002. Trunk-based workflow with squash merges

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The project is public and meant to show how a product team works, while
being built mostly by one person.

## Options considered

1. **Git Flow** (`develop`, release branches): heavy for continuous deploys.
2. **Trunk-based** with short-lived branches and PRs into a protected `main`.

## Decision

Trunk-based development. `main` is always deployable and protected by a
ruleset: PRs only, linear history, squash merges, and required checks
(`CI OK`, `Conventional PR title`) with the branch up to date. No approvals
are required because GitHub does not allow approving your own PR; CI is the
gate.

PR titles follow Conventional Commits because they become the commits on
`main`, which drive the changelog and version bumps.

## Consequences

Every change is reviewed by CI and leaves a clean, revertible commit. Merging
several PRs in a row requires updating each branch first (strict status
checks), which Dependabot does on request (`@dependabot rebase`).
