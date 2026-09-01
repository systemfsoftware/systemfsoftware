---
"@systemfsoftware/stryker-js-engine": patch
---

Instrumented files written into the sandbox now get `// @ts-nocheck` when `disableTypeChecks` is on (the default).

A TypeScript checker dry-run no longer fails the mutation run because the coverage helpers do not type-check.
