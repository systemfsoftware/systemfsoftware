---
"@systemfsoftware/effect-gherkin-spec": minor
---

Requires `@systemfsoftware/vitest` installed under the `@effect/vitest` name (`"@effect/vitest": "npm:@systemfsoftware/vitest"`) in place of the upstream package. A scenario whose steps all pass counts as asserted, a failing `expect` inside a step fails that step, and a feature's layer is built once and shared by its scenarios.
