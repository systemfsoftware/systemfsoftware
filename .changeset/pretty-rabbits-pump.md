---
"@systemfsoftware/effect-gherkin-spec": minor
---

Withdraw the `export * from '@effect/vitest'` re-export and the loose outline, pairwise and step-error names from the entry. `it` and `layer` are re-exported explicitly and the rest is reached through the `Spec` namespace.
