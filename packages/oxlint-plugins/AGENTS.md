# AGENTS.md — `packages/oxlint-plugins/`

> **Location:** `packages/oxlint-plugins/` — the oxlint plugin family: `core/` (general rule set), `test-hygiene/` (test naming), `property-testing/` (property-test contract), `effect-executor/` (executor cell), `effect-workflow/` (workflow constitution), `effect-dmmf/` (combines property-testing + effect-executor + effect-workflow under one entrypoint). Universal agent rules live in the root `AGENTS.md`; this file carries the shared rule-authoring conventions for every plugin in this folder. Package leaves carry only their package's delta.

## Critical

```yaml
rules:
  - id: MG1
    title: 100% mutation score is the gate
    do: kill every mutant with a distinguishing test or eliminate it with a restructure
    dont: ignore a killable mutant, lower the threshold, or narrow the mutate glob
    harm: an ignored killable mutant is `// Stryker disable all` with extra steps — the score certifies tests that notice nothing
    check: pnpm --filter <pkg> mutation exits 0 and reports/mutation-report.json shows zero Ignored, Survived, and NoCoverage

  - id: MG2
    title: Ignores are declaration data only
    do: register exactly `effect-schema-declarations` in stryker.config.json#ignorers for III.4 declaration data — Symbol.for descriptions, TaggedClass/TaggedError _tag and fields, optionalWith defaults
    dont: author new ignore plugins, add ignore rules for logic mutants, or use `// Stryker disable` comments
    harm: ignore rules pattern-match text, not proofs — they silently suppress mutants that tests would have killed
    check: stryker.config.json#ignorers contains only effect-schema-declarations; grep finds no `Stryker disable` in src/

  - id: CS1
    title: Static config lives in *.config.ts
    do: place meta, messages, schema, Options, constants, regexes, and message templates in `src/rules/<rule>.config.ts`; keep guards, predicates, selectors, and `create()` in the rule file; pass the imported config `meta` to `defineRule` directly without spread
    dont: declare static config inside the rule file
    harm: static data inflates the mutation surface with equivalent mutants no test can kill; behavior and declaration stop being distinguishable (III.4)
    check: the mutate glob in stryker.config.json excludes `*.config.ts`; rule files import `meta` from `./<rule>.config.js`

  - id: EF1
    title: AI-native error message format
    do: "write every message as `'{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.'`"
    dont: write freeform prose messages, or inline the four values as prose instead of as placeholders
    harm: agents and users cannot extract the violation, the expected shape, and the concrete fix from prose; inlined values cannot be asserted field-by-field in tests
    check: "review — no executable gate exists. Measured 2026-07-27: `effect-workflow/` 0 of 30 messages non-compliant, `core/` 31 of 38 across 14 rules, `test-hygiene/` 14 of 14. EF1 binds new and edited messages; the two backlogs are known, not sanctioned."

  - id: GD1
    title: Decode guards at the boundary
    do: decode path segments with `S.Tuple([S.String, S.String], S.String)` or `S.NonEmptyArray` and take elements via destructuring, `A.lastNonEmpty`, or `A.last` + `Option`; strip suffixes with `slice(0, -SUFFIX.length)` behind a load-bearing guard; delete dead ESTree-spec checks (`spec.local.type === 'Identifier'`, `decl.type === 'VariableDeclarator'`, `typeof importSource !== 'string'`)
    dont: "write manual `!== undefined` guards on runtime-shaped data, `length > 0 ? arr[len-1] : null` ternaries, or `endsWith` + regex-replace pairs"
    harm: guards the runtime contract already satisfies are unreachable code — their mutants are equivalent and unverifiable, and redundant check pairs make each other's mutants undetectable
    check: grep finds no `!== undefined` path guards or `length > 0 ?` ternaries in rule files; suffix handling is a single slice or a single regex

  - id: TS1
    title: Tests are RuleTester + DAMP + expect
    do: drive `oxlint/plugins-dev` RuleTester with vitest bindings; name tests `Should_[Behavior]_When_[Condition]` in strict PascalCase; assert with `expect()` including report `data` fields; cover every conditional with distinguishing cases per side — operator direction, computed access, aliasing, near-misses (`Object.for`, `X.TaggedClass`)
    dont: return booleans from plain `it()`; assert messageId only; assert on path prefixes
    harm: boolean returns are vacuous passes; messageId-only assertions let data-field mutants survive; the RuleTester resolves filenames to absolute paths inside node_modules so path-shape assertions never fire
    check: pnpm --filter <pkg> test exits 0 and the self-hosted `@systemfsoftware/test-hygiene(damp-test-naming)` lint passes
```

## Rule APIs

Two styles exist. Use the one the package already uses; never mix styles inside a package.

```yaml
apis:
  - id: A1
    title: New packages use defineRule
    do: write rules with `defineRule` from `@oxlint/plugins` in `test-hygiene/` and `effect-workflow/`
    dont: import ESLintUtils in these packages
    harm: two rule APIs in one package doubles the reader's mental model
    check: "`import { defineRule } from '@oxlint/plugins'` is the only rule constructor in the package"
  - id: A2
    title: core/ keeps ESLintUtils until a dedicated migration
    do: follow the `ESLintUtils.RuleCreator` template in `core/AGENTS.md` when editing `core/`
    dont: rewrite core rules to defineRule inside an unrelated task
    harm: an opportunistic API migration mixes refactor with behavior change and nothing stays reviewable
    check: every rule in `core/src/rules/` uses `createRule`
```

## Integration

`oxlint-config/src/oxlint-config.base.ts` registers plugins by package name:

```typescript
jsPlugins: ['@systemfsoftware/oxlint-plugin', '@systemfsoftware/oxlint-plugin-test-hygiene'],
rules: { '@systemfsoftware/oxlint-plugin/rule-name': 'error' },
```

Rule export format (`src/index.ts`):

```typescript
export default {
  meta: { name: PLUGIN_NAME },
  rules: { 'rule-name': rule },
  configs: { recommended: { rules: { '<PLUGIN_NAME>/rule-name': 'error' } } },
}
```

```yaml
- id: IN1
  title: configs.recommended is a rules bag and nothing else
  do: put only `rules` inside `configs.recommended`, keyed `<PLUGIN_NAME>/<rule-name>`
  dont: add a `plugins` key (or any other key) to `configs.recommended`
  harm: "oxlint's `Plugin` interface is `{ meta?, rules }` and never reads `configs`; its top-level `plugins` field accepts only built-in namespaces, so a JS plugin name there fails config parsing outright with `Unknown plugin: '<name>'` for every consumer who spreads the preset whole"
  check: "review — `Object.keys(configs.recommended)` is exactly `['rules']`. A violation is not silent: every consumer spreading the preset fails config parsing at startup."
```

Consumers register the plugin via `jsPlugins` and spread the preset's rules:

```typescript
defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-workflow'],
  rules: { ...plugin.configs.recommended.rules },
})
```

## Package Deltas

| Package             | Leaf delta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/`             | ESLintUtils template, ESLint migration notes, legacy commands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `test-hygiene/`     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `effect-workflow/`  | Spec of record (`architect-workflow` cell), deliberate non-gates, RuleTester-only rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `effect-executor/`  | Spec of record (`architect-executor` cell)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `property-testing/` | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `effect-dmmf/`      | No rules of its own, no `src/rules/`, no stryker config — `index.ts` inline-merges the other three plugins' `rules` and each source's OWN `configs.recommended.rules` (never reconstructed from `rules`, which would silently over-recommend a source's deliberate exclusion) under one plugin name. Exempt from MG1: three fixed, already-gated inputs and a spread have no decision surface a mutator would find; a dedicated behavior module + synthetic-fixture test suite was built and removed here as the cargo-culted form of this convention |

## Verification

Run in order before claiming done on any rule change:

```bash
pnpm --filter <pkg> test        # RuleTester suites
pnpm --filter <pkg> mutation    # 100% required — see MG1
pnpm check                      # root gate, exits 0
```
