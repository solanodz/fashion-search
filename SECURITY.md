# Security policy

## Reporting a vulnerability

Please do not open a public issue. Report it privately through
[GitHub's vulnerability reporting](https://github.com/solanodz/fashion-search/security/advisories/new)
(Security tab → "Report a vulnerability").

Include what you found, how to reproduce it and the impact you expect. You
should get a first answer within a week.

## Scope

This is a portfolio project. The only secrets it handles are Qdrant
credentials, which live in Vercel environment variables and never in the
repository. The production Qdrant key is read-only.
