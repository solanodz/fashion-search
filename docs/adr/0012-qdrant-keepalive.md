# 0012. Keep the free Qdrant Cloud cluster in use

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

Production uses a free Qdrant Cloud cluster. Qdrant suspends free clusters
after one week without use and deletes them about three weeks later if
they aren't reactivated. A portfolio project can easily go a week without
visitors. Qdrant's documentation doesn't define what counts as use.

## Options considered

1. **Do nothing:** reactivate by hand when suspended, and re-upload the
   vectors (about 80 s) if the cluster was deleted. Search is down until then.
2. **An external uptime monitor** pinging the site: another account, and a
   page load doesn't always reach Qdrant (facets can be cached by the browser).
3. **A Vercel Cron Job** calling an endpoint that queries Qdrant.

## Decision

Option 3. `vercel.json` schedules `GET /api/keepalive` daily at 12:00 UTC
(the Hobby plan allows daily jobs, delivered within the hour). The endpoint
runs a real vector search (`limit: 1`) and a count with the app's read-only
key, and returns the point count. When `CRON_SECRET` is set in Vercel, the
endpoint only accepts `Authorization: Bearer <CRON_SECRET>`, which Vercel
Cron sends; without it, the endpoint is public, which is harmless.

## Consequences

- The cluster sees at least one search a day, far inside the one-week
  window. If reads turn out not to count as use, the fallback is option 1;
  the data is always reproducible from `data/` with `index:upload`.
- Vercel doesn't retry failed cron runs; a single failure is covered by the
  next day's run.
- One request a day, well inside every free-tier limit.
