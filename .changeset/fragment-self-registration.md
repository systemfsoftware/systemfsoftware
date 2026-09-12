---
'@systemfsoftware/oxlint-preset': minor
'@systemfsoftware/oxlint-plugin-cell-vocabulary': minor
'@systemfsoftware/oxlint-plugin-effect-entrypoint': minor
'@systemfsoftware/oxlint-plugin-effect-schema': minor
'@systemfsoftware/oxlint-plugin-effect-workflow': minor
'@systemfsoftware/oxlint-plugin-property-testing': minor
'@systemfsoftware/oxlint-plugin-test-hygiene': minor
'@systemfsoftware/oxlint-plugin-test-placement': minor
---

New package `@systemfsoftware/oxlint-preset`: extend its default export for the strict canonical set, `@systemfsoftware/oxlint-preset/instrument` for the law-independent defect tier, and spread `defaultIgnores` for the baseline ignore globs.

Every plugin package now ships a `./preset` subpath — a self-registering config fragment. Extend it and the plugin loads and its recommended rules apply with no hand-copied rule list:

```ts
import preset from '@systemfsoftware/oxlint-plugin-effect-schema/preset'
import { defineConfig } from 'oxlint'

export default defineConfig({ extends: [preset] })
```
