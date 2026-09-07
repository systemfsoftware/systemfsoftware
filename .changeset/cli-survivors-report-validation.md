---
"@systemfsoftware/stryker-js-cli": patch
---

Survivors re-runs now validate prior-report mutants against the shared mutant schema: unknown mutant statuses and empty identifiers fail admission with the real reason instead of flowing through unchecked.
