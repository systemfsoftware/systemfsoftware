---
title: The command run before pushing invokes a CI gate's own script and differs from it only in worker counts
applies_when:
  - changing a root gate script (check:*, gate:*) or the pre-push hook
  - changing the command agent instructions name to run before pushing
tags: [ci, local-gate, pre-push, scripts]
---

The command agent instructions name to run before pushing invokes, by name, the script the pull-request job runs, and never re-lists that script's tasks. Any check the pre-push hook runs is that same script. That command differs from the pull-request job only in worker count and turbo concurrency, never in tasks, depth profile, seeds, filters or environment switches. Whether CI is set never changes which checks or plugins run, their depth (property runs, seeds) or their filters; only host reporting (annotations, step summary, failure summary) is CI-only.

```WRONG
"gate:local": "turbo run lint typecheck test",
"check:local": "CONFORMANCE_PROFILE=local pnpm gate:local"
```

```RIGHT
"check:local": "TURBO_CONCURRENCY=100% pnpm check:ci"   // the script the CI gate job runs
```

Gate: judge
