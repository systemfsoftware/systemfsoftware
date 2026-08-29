---
"@systemfsoftware/arethetypeswrong": none
"@systemfsoftware/arethetypeswrong-cli": none
---

Snapshot-testing dependency hygiene only: packages whose tests use vitest snapshot matchers now declare @vitest/snapshot at the vitest-matching version. Published code, exports, and behaviour are unchanged.
