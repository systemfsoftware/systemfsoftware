---
"@systemfsoftware/oxlint-plugin-cell-vocabulary": minor
---

The I/O-in-phase-body rule now reads phase bodies handed to the composing constructor, so a description authored as one spec object is judged like the chained form. An I/O call written inside a pure phase of such a description is now reported where it was previously missed.
