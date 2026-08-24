---
"@systemfsoftware/tsconfig": patch
---

The Node tsconfig base now targets ES2024, so package-root config files that use modern APIs (such as Promise.withResolvers) typecheck correctly instead of failing on the old default target
