---
"@systemfsoftware/effect-schema-law": major
"@systemfsoftware/effect-schema-discovery": major
"@systemfsoftware/oxlint-plugin-recommended": none
"@systemfsoftware/tsconfig": none
---

The package that asserted a schema rejects invalid input is gone. If you imported the second entry to declare those assertions, remove that import — the package now ships only the round-trip laws.
