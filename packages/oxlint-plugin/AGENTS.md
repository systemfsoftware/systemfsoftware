# AGENTS.md — `packages/oxlint-plugin/`

Governs every plugin and shared kernel below this directory; root `AGENTS.md` governs the rest.

## Diagnostic contract (OP-D1)

Oxlint runs in agent loops with `--format=agent`, one line per finding. Every rule message is a single line in four parts, and `Fix:` names the literal replacement — a message that only forbids makes the agent oscillate or suppress the rule:

```typescript
export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
```

Absence checks open with `'{{name}} is untested.'` and keep the same three tail parts. `{{actual}}` is what the visitor observed; `{{fix}}` carries code tokens, not advice.

wrong: `'Data.TaggedError is not allowed.'` / right: `'Data.TaggedError is forbidden. Expected: a Schema.TaggedError class. Actual: Data.TaggedError(...). Fix: class E extends S.TaggedError<E>()("E", {}) {}.'`

## Plugin boundaries

| ID      | Rule                                                                                                                                                                                                                                                                                                                                   | Gate                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **EW1** | `oxlint-plugin-dmmf-workflow` holds prohibitions only. Never add a rule that fails a workflow for lacking a Command/Decision/Error schema: `Workflow.make`'s `Inhabited` constraint already refuses it at construction, so a lint report duplicates a compile error.                                                                   | `pnpm --filter @systemfsoftware/oxlint-plugin-dmmf-workflow test` — `Should_Ignore_When_TheCommandIsAPlainClass` pins the silence           |
| **TP3** | File placement — which filenames may exist where — lives only in `@systemfsoftware/oxlint-plugin-test-discipline`; no other plugin reports on a file's location.                                                                                                                                                                       | `review` — wrong: an `effect-schema` rule reporting a `*.schema.ts` outside `src/`; right: that verdict added to the test-discipline plugin |
| **TP5** | Two behaviour test suffixes exist: `*.integration.test.ts` (Gherkin) and `*.differential.test.ts` (`@systemfsoftware/differential-spec`). A third lands only together with the rule that enforces it.                                                                                                                                  | `pnpm --filter @systemfsoftware/oxlint-plugin-test-discipline test` — the retired-suffix suite rejects `.composition`/`.feature`            |
| **IO4** | `import-origin` and `make-boundary` are shared kernels, not plugins: deliberately no tests and no `stryker.config.json` (a mutation config over a test-less package fails CI vacuously) — consumers' RuleTester suites are the net. Consumers take them as `devDependencies` and bundle them; no plugin depends on another at runtime. | `test ! -e packages/oxlint-plugin/import-origin/stryker.config.json && test ! -e packages/oxlint-plugin/make-boundary/stryker.config.json`  |
