---
"@systemfsoftware/effect-schema-law": minor
---

Laws register as plain Vitest tests: `@systemfsoftware/vitest` is no longer a peer, `vitest` is an optional peer, and `fast-check` is a dependency. Signatures and test names are unchanged, except the single-inhabitant law drops its `[exempt: deterministic]` suffix. A failure reports the shrunk counterexample and replay seed; an undrawable input or a failed Effect verdict is its own failure, never a refutation. `@systemfsoftware/vitest-config` suites keep their guard and run budget.

`recursionLaws` now samples at the declared depth times the `Schema.suspend` crossings one nesting level costs. A union whose recursive fields suspend again previously never drew its recursive members, so `Variants_⊇Declared` always failed.
