---
"@systemfsoftware/discern": patch
---

The published bundle no longer inlines `vitest`, `vite`, `chai`, `tinybench`, `expect-type`, `magic-string`, `@jridgewell/sourcemap-codec`, `@effect/platform-node` or `@effect/platform-node-shared`; the code that pulled them in was test-only. No runtime or API change.
