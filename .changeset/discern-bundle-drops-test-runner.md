---
"@systemfsoftware/discern": patch
---

The published bundle no longer inlines `vitest`, `vite`, `chai`, `tinybench`, `expect-type`, `magic-string`, `@jridgewell/sourcemap-codec` or `@effect/platform-node`; the code that pulled them in was test-only. No runtime or API change.
