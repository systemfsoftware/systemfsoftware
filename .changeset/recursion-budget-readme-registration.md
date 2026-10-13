---
"@systemfsoftware/effect-schema-recursion-budget": patch
---

The README now says to register `recursionBudgetTransform()` in the Vitest configuration of every package whose tests draw values from a budgeted schema, because the transform is the only thing that checks a declared budget and nothing reports a missing registration. It also states that generated depth is bounded by the `size` a test passes, not by `maxDepth`.
