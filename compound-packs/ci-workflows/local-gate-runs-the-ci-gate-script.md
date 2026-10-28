---
title: The command run before pushing invokes a CI gate's own script and differs from it only in worker counts
applies_when:
  - changing a root check script or the pre-push hook
  - changing the command contributor or agent instructions name to run before pushing
  - making a check, a plugin, a depth setting or a filter depend on whether CI is set
tags: [ci, local-gate, pre-push, scripts]
---

The command that contributor and agent instructions name to run before pushing, and every check the pre-push hook runs, invokes by name the script a CI gate job runs. It never re-lists that script's tasks in a second definition.

It differs from the CI job only in worker count and task-runner concurrency, never in tasks, depth (property-test runs, seeds), filters or environment switches.

Whether the CI variable is set never changes which checks or plugins run, their depth or their filters. Only host reporting (annotations, the step summary) is CI-only.

Decision test: read the pre-push command, the pre-push hook and the CI gate job the diff touches. The diff fails when the local command lists tasks instead of calling the gate's script, when it sets anything other than a worker or concurrency knob, or when any check, plugin, depth or filter reads the CI variable.

Defect prevented: two definitions of the gate drift apart. A change passes locally and fails in CI, and the author finds the difference one round trip later. The reverse also happens: a check that is lighter or skipped in CI lets a defect through that the local run would have caught.

```json
// WRONG: CI runs `pnpm check`; the pre-push command re-lists tasks, drops typecheck and lowers the property-test depth
"check": "turbo run lint typecheck test",
"prepush": "PROPERTY_RUNS=10 turbo run lint test"
```

```json
// RIGHT: CI runs `pnpm check`; the pre-push command calls the same script with fewer workers
"check": "s=0; pnpm lint || s=1; pnpm typecheck || s=1; pnpm test || s=1; exit $s",
"prepush": "TURBO_CONCURRENCY=50% pnpm check"
```

Source: Martin Fowler, "Continuous Integration" (2024): "anyone should be able to bring in a clean machine, check the sources out of the repository, issue a single command, and have a running system on their own environment", and on the local build before a push: "there is a reason that 'works on my machine' is a well-known phrase in programmer circles" (https://martinfowler.com/articles/continuousIntegration.html).

Gate: judge
