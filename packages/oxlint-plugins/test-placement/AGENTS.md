# AGENTS.md — `test-placement/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

This package ships six rules enforcing where tests may live and which test suffixes are sanctioned. They are turned on by `@systemfsoftware/oxlint-config/strict`; packages that extend only `base` load the plugin but enable none of its rules.

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
  title: `*.schema.test.ts` is forbidden, `schema-laws.test.ts` is the one whitelisted name
  do: leave a package's schema coverage to `src/schema-laws.test.ts`, the single file importing `virtual:@systemfsoftware/schema-laws`
  dont: re-admit a `*.schema.test.ts` branch to no-test-file-in-src, or add a second name-whitelisted test file
  harm: the generated `ruleOfSchemas` pair already covers every exported schema, so an authored schema test is duplicate coverage that drifts — and the suffix is what agents reach for when they want to look thorough
  check: SCHEMA_SUFFIX is only ever read to report `schemaTestInSrc`; SCHEMA_LAWS_BASENAME is the only exact-basename allowance in the taxonomy
```
