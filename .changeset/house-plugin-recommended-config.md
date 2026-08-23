---
'@systemfsoftware/oxlint-plugin': minor
---

The plugin now recommends its own rules. `configs.recommended` lists every rule it ships,
so a configuration can spread it instead of transcribing the rule names:

```ts
import house from '@systemfsoftware/oxlint-plugin'

export default {
  plugins: ['@systemfsoftware/oxlint-plugin'],
  rules: { ...house.configs.recommended.rules },
}
```

A hand-written list drifts silently — a rule added here never reaches a configuration that
spelled its predecessors out, and a renamed rule is reported as unknown at most once. Every
sibling plugin in this family already published this shape
