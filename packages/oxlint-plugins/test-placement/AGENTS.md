# AGENTS.md — `test-placement/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

This package ships eight rules enforcing where tests may live and which test suffixes are sanctioned. All eight reach a package through `@systemfsoftware/oxlint-config/base`, which spreads `@systemfsoftware/oxlint-plugin-effect-dmmf`'s recommended set and re-exports them under the `@systemfsoftware/effect-dmmf/` namespace; `strict` adds nothing from this plugin, and neither preset loads it standalone.

```yaml
- id: TP1
  title: The rules live in strict, never in a preset of their own
  do: add or change a test-placement rule's severity in oxlint-config.strict.ts
  dont: introduce a separate oxlint-config preset to carry these rules
  harm: strict is already extended by exactly the packages that carry the cell taxonomy, so a dedicated preset is a third layer that changes no behaviour — it only adds a concept the next reader has to resolve
  check: packages/oxlint-config/src has no oxlint-config.test-placement.ts and package.json#exports has no ./test-placement entry

- id: TP2
  title: This package's own RuleTester suites stay in src
  do: keep RuleTester suites at src/rules/__tests__/<rule>.test.ts per packages/oxlint-plugins/AGENTS.md#TS1
  dont: add an oxlint.config.ts here to make this package lint itself under its own rules
  harm: no package under packages/oxlint-plugins/ has an oxlint.config.ts, so none inherits base or strict; adding one here would enrol this package alone and break the family's TS1/EE4 convention for zero architectural gain
  check: this package has no oxlint.config.ts

- id: TP3
  title: Placement lives in exactly one plugin
  do: keep every test-location ruling in this package
  dont: re-add a location branch to effect-workflow's workflow-property-test-shape or any other plugin
  harm: two rules claiming placement produced a live contradiction (workflow-property-test-shape required parentDir === '__tests__'; this package requires property tests in src) that made enrolled packages unlintable
  check: grep finds no 'wrongLocation' messageId outside this package

- id: TP4
  title: "`*.schema.test.ts` is forbidden; generated laws and authored refusals are the two sanctioned forms"
  do: leave a schema's round-trip coverage to the generated `src/schema-laws.test.ts`, and put any refusal it needs in `<name>.schema.property.test.ts`
  dont: re-admit a `*.schema.test.ts` branch to no-test-file-in-src, or add a second name-whitelisted test file
  harm: the generated `ruleOfSchemas` pair draws every input from the arbitrary the schema itself supplies, so it covers everything the schema accepts and nothing it rejects — an authored `*.schema.test.ts` restates the covered half and drifts, while the uncovered half needs the property-cell suffix rather than this one
  check: SCHEMA_SUFFIX is only ever read to report `schemaTestInSrc`; SCHEMA_LAWS_BASENAME is the only exact-basename allowance in the taxonomy

- id: TP5
  title: One behaviour suffix — the double policy is a judgement, not a filename
  do: name every behaviour test `*.integration.test.ts` whether or not it doubles at a port; reach for delete before naming it at all when the assertion restates a pure-cell literal
  dont: re-introduce `*.composition.test.ts` or any second behaviour suffix; keep a `*.feature.test.ts` suffix or a rename of it that still names "feature" rather than the layer; treat a suffix choice as a destination rather than a decision the assertion must earn
  harm: the retired `.feature.test.ts` suffix let an AI produce 41 gherkin scenarios asserting pure-function results — a unit test in gherkin costume; the composition/integration split that replaced it asked authors to encode a doubles policy in a filename, which produced the same misfiling one layer up. The remaining rules must keep behaviour tests reaching a real use case AND make deletion reachable from every `Fix:` they emit
  check: grep finds no `.composition.test.ts` and no `.feature.test.ts` outside test-suffix-outside-src fixtures asserting they are rejected; test-suffix-outside-src admits exactly INTEGRATION_SUFFIX; the four behaviour rules' `Fix:` strings make "delete it" a first-class outcome
```
