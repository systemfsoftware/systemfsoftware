---
"@systemfsoftware/effect-schema-law": major
"@systemfsoftware/effect-schema-discovery": major
"@systemfsoftware/oxlint-plugin-effect-schema": major
"@systemfsoftware/oxlint-plugin-effect-dmmf": major
"@systemfsoftware/oxlint-plugin-recommended": none
"@systemfsoftware/tsconfig": none
---

The extra entry that asserted a schema rejects invalid input is gone. If you imported it to declare those assertions, drop that import — the package now ships only the round-trip laws.

The lint rule that forbade restating those round-trip laws in a schema property test is also gone. If you still listed no-schema-law-duplicate among your rules, delete that name.
