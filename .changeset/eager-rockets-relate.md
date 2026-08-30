---
"@systemfsoftware/all": minor
---

The preset now fails any import of a host builtin specifier — prefixed or unprefixed — and any `@std` module that mirrors a platform service. Consumers must take the corresponding platform service or a Web Standard API instead; the diagnostic names the replacement.
