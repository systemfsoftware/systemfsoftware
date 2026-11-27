---
"@systemfsoftware/tsdown-config": minor
---

Adds the `inject-types` entry: `injectTypes`, a tsdown `exports.customExports` hook that sets the root entry's `types` condition to `./dist/index.d.ts` and puts `default` after it, and its `ExportEntry` type.
