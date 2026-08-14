---
description: Require the compound-engineering review lifecycle before a pull request is opened
condition:
  - pr_create
  - gh pr create
scope:
  - tool
interruptMode: tool-only
---

# Before you open a pull request

Opening the PR is the last step, not the next one. Run the lifecycle on the diff you are about to ship:

1. `read skill://ce-simplify-code` — simplify the settled code (behaviour preserved, verified).
2. `read skill://ce-code-review` — review the result; fix what it finds.
3. `read skill://ce-compound` — capture anything durable the work taught.

Already done in this session? Say so in one line and re-issue the same call — this fires once per session, so the retry goes through.

Merging stays human (`REPO-P1`).
