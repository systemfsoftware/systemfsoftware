---
"@systemfsoftware/effect-gherkin-spec": major
"@systemfsoftware/effect-schema-law": major
"@systemfsoftware/effect-spec-runtime": minor
"@systemfsoftware/trace-spec": minor
---

The lawful test runner is now a peer dependency under its own name, `@systemfsoftware/vitest`, instead of the `@effect/vitest` alias that pointed at it. Install `@systemfsoftware/vitest` and import `it`, `layer`, `expect`, and the rest from `@systemfsoftware/vitest`. `@systemfsoftware/effect-gherkin-spec` re-exports `it` and `layer` from `@systemfsoftware/vitest`.
