---
"@systemfsoftware/oxlint-plugin-test-placement": minor
---

Add the in-source-test-snapshot-only rule: a hand-written in-source test block may contain only authored inline-snapshot assertions over non-exported symbols. Hand-written property constructs (it.prop, FastCheck, Arbitrary), other expect terminals, expectTypeOf, node:assert, throw-as-assertion, and empty toMatchInlineSnapshot() placeholders are errors. The generated ruleOfSchemas schema-law channel is exempt.
