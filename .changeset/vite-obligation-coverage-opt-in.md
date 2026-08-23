---
"@systemfsoftware/effect-schema-vite": major
---

Obligation-coverage assertions are now opt-in. By default the generated suite emits only the codec laws, and no refutation package needs to be installed for it to run.

To keep the coverage assertion, install `@systemfsoftware/effect-schema-refutation` and set the new `refutationCoverage` option:

```ts
inlineSchemaTests({ refutationCoverage: true })
```
