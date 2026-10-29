---
title: Pre-push commands invoke the CI gate script and differ only in worker count
applies_when:
  - changing a root check script or the pre-push hook
  - changing the command contributor or agent instructions name to run before pushing
  - making a check, a plugin, a depth setting or a filter depend on whether CI is set
tags: [ci, local-gate, pre-push, scripts]
---

Pre-push commands and hooks invoke the CI gate script directly by name. They never define a second list of tasks.

A local gate run differs from a CI gate run only in worker count or task concurrency. Local runs never alter tasks, test depth (such as property-test runs or seeds), filters, or environment switches.

The `CI` environment variable must never change which checks or plugins run, their depth, or their filters. Only host reporting (annotations and step summaries) may depend on `CI`.

Decision test: inspect the pre-push command, pre-push hook, and CI gate jobs touched in the diff. Fail the diff if:

- A local command defines its own list of tasks instead of calling the CI gate script.
- A local command changes anything other than concurrency or worker count.
- Any check, plugin, test depth, or filter reads the `CI` environment variable.

Defect prevented: gate drift. Discrepancies between local and CI gate definitions cause changes to pass locally but fail in CI, or cause lighter CI checks to let defects pass through.

```yaml
# WRONG: CI runs `pnpm check`; the pre-push command re-lists tasks, drops typecheck and lowers the property-test depth
check: "turbo run lint typecheck test"
prepush: "PROPERTY_RUNS=10 turbo run lint test"
```

```yaml
# RIGHT: CI runs `pnpm check`; the pre-push command calls the same script with fewer workers
check: "s=0; pnpm lint || s=1; pnpm typecheck || s=1; pnpm test || s=1; exit $s"
prepush: "TURBO_CONCURRENCY=50% pnpm check"
```

Source: Martin Fowler, "Continuous Integration" (2024): "anyone should be able to bring in a clean machine, check the sources out of the repository, issue a single command, and have a running system on their own environment", and on the local build before a push: "there is a reason that 'works on my machine' is a well-known phrase in programmer circles" (https://martinfowler.com/articles/continuousIntegration.html).

Gate: judge
