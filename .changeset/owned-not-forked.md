---
"@systemfsoftware/effect-atom": patch
"@systemfsoftware/effect-atom-react": patch
"@systemfsoftware/stryker-plugins": patch
---

The `atom` packages publish their own author rather than crediting an upstream they are not downstream of, and `stryker-plugins` no longer pulls Node's ambient types into a package that has no runtime dependency on them.
