---
"@systemfsoftware/effect-schema-discovery": major
---

`identityOf` now takes a `FoundSchema` and returns a `SchemaIdentity` (`<file>#<name>`); call `identityOf({ filePath, name })` where you passed the two strings. `quote` returns a `QuotedText`.
