---
"@systemfsoftware/effect-cell-types": patch
"@systemfsoftware/effect-daemon-spec": none
---

Re-export the `Cell` type under the `Sandwich` namespace so downstream declaration emit can infer portable return types for `Sandwich` combinator chains without explicit type annotations.
