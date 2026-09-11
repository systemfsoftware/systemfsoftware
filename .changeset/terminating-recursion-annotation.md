---
"@systemfsoftware/effect-schema-extensions": minor
---

`terminatingRecursion` builds a recursive union whose generated values stop at a declared ceiling: pass the finite `base` members, the recursive `recur` members, the `maxDepth` and `depthSize` budget, and an `identifier` unique to that recursive cycle.
