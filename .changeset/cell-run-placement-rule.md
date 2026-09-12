---
"@systemfsoftware/oxlint-plugin-effect-entrypoint": minor
---

`cell-run-placement` is a new rule: it reports `Cell.run` in any module but the process entry module `main.ts`. There is no option to designate a second root — the entry designation is the exact basename `main.ts` — and test files are exempt.

The recommended rule set does not include it, so spreading `configs.recommended` does not enable it. Name it to turn it on:

```ts
rules: { '@systemfsoftware/oxlint-plugin-effect-entrypoint/cell-run-placement': 'error' }
```
