---
"@systemfsoftware/effect-schema-recursion-budget": major
---

The transform now imports its runtime from the new `@systemfsoftware/effect-schema-recursion-budget/runtime` subpath, and `RECURSION_BUDGET_VIRTUAL_ID` and the transform's `resolveId` hook are removed; `RECURSION_BUDGET_RUNTIME_SPECIFIER` names the injected specifier. If you use `recursionBudgetTransform` directly, depend on this package directly so the subpath resolves, and stop registering the virtual id.
