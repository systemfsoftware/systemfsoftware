---
"@systemfsoftware/oxlint-plugin-cell-vocabulary": major
---

The rule now judges pure phase bodies authored as `Cell.layer` spec properties. Phase bodies written through chained phase-call expressions are no longer detected, because the library no longer produces them — move those bodies into the spec form to stay covered.
