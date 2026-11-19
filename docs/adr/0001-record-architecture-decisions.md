# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Decisions such as where the model runs or which vector database to use shape
the whole project. Without a record, the reasons get lost and decisions get
re-argued.

## Decision

We record significant decisions as short Markdown ADRs in `docs/adr/`, using
[`template.md`](template.md). An ADR ships in the same PR as the change it
describes. Accepted ADRs are not rewritten; a new ADR supersedes them.

## Consequences

Reviewers and future contributors can see why the system looks the way it
does. Writing an ADR adds a few minutes to large decisions only.
