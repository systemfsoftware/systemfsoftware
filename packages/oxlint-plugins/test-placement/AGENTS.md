# AGENTS.md — `test-placement/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

This package ships six rules enforcing where tests may live and which test suffixes are sanctioned. The rules gate the DMMF cell taxonomy, which lives only under `omp/`; this tooling package carries no cells.

```yaml
- id: TP1
  title: This package is not enrolled in its own rules
  do: keep RuleTester suites at src/rules/__tests__/<rule>.test.ts per packages/oxlint-plugins/AGENTS.md#TS1
  dont: move this package's tests to satisfy the rules it ships
  harm: the rules gate the DMMF cell taxonomy, which this tooling package does not carry; migrating would break the family's TS1/EE4 convention for zero architectural gain
  check: this package's oxlint.config.ts does not exist and oxlint-config/test-placement is not extended here

- id: TP2
  title: Placement lives in exactly one rule
  do: keep every test-location ruling in this package
  dont: re-add a location branch to effect-workflow's workflow-property-test-shape or any other plugin
  harm: two rules claiming placement produced a live contradiction (workflow-property-test-shape required parentDir === '__tests__'; this package requires property tests in src) that made enrolled packages unlintable
  check: grep finds no 'wrongLocation' messageId outside this package
```
