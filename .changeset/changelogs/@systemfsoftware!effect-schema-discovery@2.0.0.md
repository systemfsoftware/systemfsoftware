## 2.0.0

### Major Changes

- `identityOf` now takes a `FoundSchema` and returns a `SchemaIdentity` (`<file>#<name>`); call `identityOf({ filePath, name })` where you passed the two strings. `quote` returns a `QuotedText`.
