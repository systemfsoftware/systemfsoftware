# AGENTS.md — `test-placement/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

This package ships eight rules enforcing where tests may live and which test suffixes are sanctioned. All eight reach a package through `@systemfsoftware/oxlint-config/base`, which spreads `@systemfsoftware/oxlint-plugin-effect-dmmf`'s recommended set and re-exports them under the `@systemfsoftware/effect-dmmf/` namespace; `strict` adds nothing from this plugin, and neither preset loads it standalone.

```yaml
- id: TP1
  title: The rules live in strict, never in a preset of their own
  do: add or change a test-placement rule's severity in oxlint-config.strict.ts
  dont: introduce a separate oxlint-config preset to carry these rules
  harm: strict is already extended by exactly the packages that carry the cell taxonomy, so a dedicated preset is a third layer that changes no behaviour — it only adds a concept the next reader has to resolve
  check: "`test ! -e packages/oxlint-config/src/oxlint-config.test-placement.ts` exits 0, and `grep -q '\"\\./test-placement\"' packages/oxlint-config/package.json` exits 1 (no exports entry)"

- id: TP2
  title: This package's own RuleTester suites stay in src
  do: keep RuleTester suites at src/rules/__tests__/<rule>.test.ts per packages/oxlint-plugins/AGENTS.md#TS1
  dont: add an oxlint.config.ts here to make this package lint itself under its own rules
  harm: no package under packages/oxlint-plugins/ has an oxlint.config.ts, so none inherits base or strict; adding one here would enrol this package alone and break the family's TS1/EE4 convention for zero architectural gain
  check: "`test ! -e packages/oxlint-plugins/test-placement/oxlint.config.ts` exits 0"

- id: TP3
  title: Placement lives in exactly one plugin
  do: keep every test-location ruling in this package
  dont: re-add a location branch to effect-workflow's workflow-property-test-shape or any other plugin
  harm: two rules claiming placement produced a live contradiction (workflow-property-test-shape required parentDir === '__tests__'; this package requires property tests in src) that made enrolled packages unlintable
  check: "`grep -rn 'wrongLocation' packages --include='*.ts' | grep -v 'packages/oxlint-plugins/test-placement/'` returns no hits — the retired messageId has no source site outside this package"

- id: TP4
  title: "`*.schema.test.ts` is forbidden; generated laws and in-source refusals are the two sanctioned forms"
  do: leave a schema's round-trip coverage to the generated `src/schema-laws.test.ts`, and state any refusal it needs as an in-source `if (import.meta.vitest !== void 0)` block in the schema module holding a `refutes(schema, generators)` call — the combinator from `@systemfsoftware/effect-schema-refutation` is the sanctioned form a refusal takes; a block's fixture schemas stay inside the block so they never reach `schema-declaration-location`'s module-scope arm
  dont: re-admit a `*.schema.test.ts` branch to no-test-file-in-src, or add a second name-whitelisted test file, or file the refusal as a `<name>.schema.property.test.ts` beside a schema whose only test is a refusal
  harm: the generated `ruleOfSchemas` pair draws every input from the arbitrary the schema itself supplies, so it covers everything the schema accepts and nothing it rejects — an authored `*.schema.test.ts` restates the covered half and drifts, while the uncovered half is a refusal that has no file home under the workflow taxonomy
  check: "`grep -rn 'SCHEMA_SUFFIX' packages/lint/oxlint/plugins/testing/test-placement/src` hits only path.config.ts and no-test-file-in-src.ts — the rule whose schema report is solely schemaTestInSrc; `grep -rn '=== SCHEMA_LAWS_BASENAME' packages/lint/oxlint/plugins/testing/test-placement/src` hits only the single exact-basename allowance in no-test-file-in-src.ts"

- id: TP5
  title: One behaviour suffix — the double policy is a judgement, not a filename
  do: name every behaviour test `*.integration.test.ts` whether or not it doubles at a port; reach for delete before naming it at all when the assertion restates a pure-cell literal
  dont: re-introduce `*.composition.test.ts` or any second behaviour suffix; keep a `*.feature.test.ts` suffix or a rename of it that still names "feature" rather than the layer; treat a suffix choice as a destination rather than a decision the assertion must earn
  harm: the retired `.feature.test.ts` suffix let an AI produce 41 gherkin scenarios asserting pure-function results — a unit test in gherkin costume; the composition/integration split that replaced it asked authors to encode a doubles policy in a filename, which produced the same misfiling one layer up. The remaining rules must keep behaviour tests reaching a real use case AND make deletion reachable from every `Fix:` they emit
  check: "`grep -rn -e '\\.composition\\.test\\.ts' -e '\\.feature\\.test\\.ts' packages/oxlint-plugins/test-placement/src` hits only the test-suffix-outside-src suite asserting the retired suffixes are rejected; `grep -n 'INTEGRATION_SUFFIX' packages/oxlint-plugins/test-placement/src/rules/test-suffix-outside-src.ts` shows basename.endsWith(INTEGRATION_SUFFIX) as the sole admission; `grep -rn 'delete' packages/oxlint-plugins/test-placement/src/rules/behaviour-exercises-use-case.config.ts packages/oxlint-plugins/test-placement/src/rules/behaviour-one-feature-per-file.config.ts packages/oxlint-plugins/test-placement/src/rules/test-suffix-outside-src.config.ts` returns hits — the Fix strings that decide a behaviour file's fate make deleting a change detector a first-class outcome"

- id: TP6
  title: The obligation this package carries is src-property-test-cell's presence arm
  do: keep `src-property-test-cell`'s `missingCellTest` report — for a source file whose suffix names a cell listed in the `cellsRequiringTest` option, it fires on the ABSENCE of an in-source vitest block, and that arm is this package's OX-OB1 obligation
  dont: reduce this package to prohibitions by deleting the presence arm; satisfy it by widening the arm to stat the disk for a sibling test, which OX-TS2 forbids — the satisfying evidence must be readable from the linted file's own AST
  harm: with prohibitions alone a cell carrying no test at all passes every rule here, so the taxonomy only channels tests someone already chose to write; the list defaults empty, which keeps the arm opt-in and leaves a consumer who declares nothing unaccused
  check: "`grep -rn -e 'missingCellTest' -e 'Should_Report_When_DeclaredCellHasNoColocatedTestAndNoInSourceBlock' -e 'Should_StaySilent_When_NoCellsAreDeclared' packages/oxlint-plugins/test-placement/src` returns hits for the registered messageId and both named suite cases"
```
