---
"@systemfsoftware/oxlint-plugin-cell-architecture": minor
"@systemfsoftware/oxlint-config-cell-architecture": patch
"@systemfsoftware/oxlint-config-recommended": patch
---

`ban-unknown` rejects `unknown` except as a generic default (`<A = unknown>`), a type-predicate parameter (`(u: unknown): u is T`), or a catch binding. The recommended config enables it.
