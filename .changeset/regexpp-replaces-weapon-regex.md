---
"@systemfsoftware/stryker-js-instrumenter": patch
---

The instrumenter no longer depends on `weapon-regex`, a Scala library compiled to JavaScript that is no longer maintained. It is replaced by `@eslint-community/regexpp`, which has no dependencies of its own. Regular expression mutants are unchanged, so no action is required.
