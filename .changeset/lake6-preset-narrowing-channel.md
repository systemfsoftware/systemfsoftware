---
"@systemfsoftware/debt-ledger": minor
---

List every oxlint preset scope narrowing — a rule a configuration enables only inside some overrides,
withholds from some globs, or enables with an option that exempts names or paths — as a ledger entry.
Each is read by parsing the preset source, Declared by a matching opt-in in its preset package, and
Undeclared otherwise; a declaration that matches no narrowing is Stale.
