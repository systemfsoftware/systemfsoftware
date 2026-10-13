---
"@systemfsoftware/effect-schema-recursion-budget": patch
---

The README now says to register `recursionBudgetTransform()` in the Vitest configuration of every package whose tests draw values from a budgeted schema, and that nothing reports a missing registration: without it, generation uses Effect's stock recursion.
