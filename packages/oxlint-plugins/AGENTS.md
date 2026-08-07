# AGENTS.md — `packages/oxlint-plugins/`

> **Location:** `packages/oxlint-plugins/` — the oxlint plugin family. General: `core/` (general rule set), `test-hygiene/` (test naming), `property-testing/` (property-test contract), `test-placement/` (test location and suffix), `cell-taxonomy/` (source filenames name their cell), `effect-entrypoint/` (`main.ts` is an interpretation edge, not a cell), `recommended/`, `effect-dmmf/` (combines property-testing + effect-executor + effect-workflow + cell-taxonomy under one entrypoint). One package per architecture cell: `effect-{workflow,executor,handler,middleware,acl,adapter,store,state,schema,shape,policy,kernel,observer}/`. Universal agent rules live in the root `AGENTS.md`; this file carries the shared rule-authoring conventions for every plugin in this folder. Package leaves carry only their package's delta.

## Critical

```yaml
rules:
  - id: OX-MG1
    title: Zero Ignored mutants — stricter than the root score gate
    do: kill every mutant with a distinguishing test or eliminate it with a restructure
    dont: reach the number by ignoring a killable mutant
    harm: the score excludes Ignored from its denominator, so a package can report a passing score while an ignorer absorbs mutants no test kills
    check: pnpm --filter <pkg> mutation exits 0 and reports/mutation-report.json shows zero Ignored, Survived, and NoCoverage

  - id: OX-MG2
    title: Ignores are declaration data only
    do: register exactly `effect-schema-declarations` in stryker.config.json#ignorers for III.4 declaration data — Symbol.for descriptions, TaggedClass/TaggedError _tag and fields, optionalWith defaults
    dont: author new ignore plugins, add ignore rules for logic mutants, or use `// Stryker disable` comments
    harm: ignore rules pattern-match text, not proofs — they silently suppress mutants that tests would have killed
    check: `stryker.config.json#ignorers` lists nothing beyond `effect-schema-declarations`, and grep finds no `Stryker disable` in src/

  - id: OX-CS1
    title: Static config lives in *.config.ts
    do: place meta, messages, schema, Options, constants, regexes, and message templates in `src/rules/<rule>.config.ts`; keep guards, predicates, selectors, and `create()` in the rule file; pass the imported config `meta` to `defineRule` directly without spread
    dont: declare static config inside the rule file
    harm: static data inflates the mutation surface with equivalent mutants no test can kill; behavior and declaration stop being distinguishable (III.4)
    check: the mutate glob in stryker.config.json excludes `*.config.ts`; rule files import `meta` from `./<rule>.config.js`

  - id: OX-EF1
    title: AI-native error message format
    do: "write every message as `'{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.'`"
    dont: write freeform prose messages, or inline the four values as prose instead of as placeholders
    harm: agents and users cannot extract the violation, the expected shape, and the concrete fix from prose; inlined values cannot be asserted field-by-field in tests
    check: "review — no executable gate exists. Measured 2026-07-27: `effect-workflow/` 0 of 30 messages non-compliant, `core/` 31 of 38 across 14 rules, `test-hygiene/` 14 of 14. OX-EF1 binds new and edited messages; the two backlogs are known, not sanctioned."

  - id: OX-EF2
    title: A fix must be able to end in deletion
    do: write `{{fix}}` as a decision procedure — name the failure mode, then let the reader reach "delete it" when the code defends nothing; for a test rule, say plainly that an assertion restating a literal from the cell under test is a change detector and gets deleted, not rehoused
    dont: write a `{{fix}}` whose only outcome is a new address for the same code, or one that can be satisfied by editing the offending string instead of the design
    harm: an agent that trips the rule reads the fix, goes looking for a new home, and never considers that the code should not exist — measured twice on 2026-08-02, 41 gherkin scenarios restating a lookup table were routed toward a new suffix instead of deleted, and `executor-import-boundary`'s spelling-shaped fix induced an agent to write an import path absent from disk
    check: "review — no executable gate exists. Each `_FIX` constant either names deletion as a reachable outcome or states why relocation is the only correct end for that violation."

  - id: OX-GD1
    title: Decode guards at the boundary
    do: decode path segments with `S.Tuple([S.String, S.String], S.String)` or `S.NonEmptyArray` and take elements via destructuring, `A.lastNonEmpty`, or `A.last` + `Option`; strip suffixes with `slice(0, -SUFFIX.length)` behind a load-bearing guard; delete dead ESTree-spec checks (`spec.local.type === 'Identifier'`, `decl.type === 'VariableDeclarator'`, `typeof importSource !== 'string'`)
    dont: "write manual `!== undefined` guards on runtime-shaped data, `length > 0 ? arr[len-1] : null` ternaries, or `endsWith` + regex-replace pairs"
    harm: guards the runtime contract already satisfies are unreachable code — their mutants are equivalent and unverifiable, and redundant check pairs make each other's mutants undetectable
    check: grep finds no `!== undefined` path guards or `length > 0 ?` ternaries in rule files; suffix handling is a single slice or a single regex

  - id: OX-TS1
    title: Tests are RuleTester + DAMP + expect
    do: drive `oxlint/plugins-dev` RuleTester with vitest bindings; name tests `Should_[Behavior]_When_[Condition]` in strict PascalCase; assert with `expect()` including report `data` fields; cover every conditional with distinguishing cases per side — operator direction, computed access, aliasing, near-misses (`Object.for`, `X.TaggedClass`)
    dont: return booleans from plain `it()`; assert messageId only; assert on path prefixes; spawn oxlint as a subprocess, import `dist/`, or assert on `configs`/`meta` shape
    harm: boolean returns are vacuous passes; messageId-only assertions let data-field mutants survive; the RuleTester resolves filenames to absolute paths inside node_modules so path-shape assertions never fire
    check: pnpm --filter <pkg> test exits 0 and the self-hosted `@systemfsoftware/test-hygiene(damp-test-naming)` lint passes

  - id: OX-TS2
    title: A rule may only depend on facts RuleTester can supply
    do: take project knowledge through `options` or `settings` and read everything else from the linted file's own AST; check such a declaration against a real tree in the plugin's own suite, where the filesystem legally lives
    dont: make a verdict depend on a fact only the disk carries — a sibling file's existence, a directory listing, another package's contents
    harm: RuleTester cannot create a sibling, so a disk-dependent arm never gets a passing valid case and cannot meet OX-MG1. Stating that as a platform limit is false — `Context` carries `cwd`, `physicalFilename`, and `settings`, and a rule runs in Node — and the false version pushes the next author off the lint channel for a rule that was always writable
    check: every arm is reachable from a RuleTester case built out of `code`, `filename`, `options`, and `settings` alone — `src-property-test-cell`'s `cellsRequiringTest` arm is the worked example; grep still finds no `existsSync`, `statSync`, or `readdirSync` in any `src/rules/` file

  - id: OX-OB1
    title: Keep an obligation, not only prohibitions
    do: keep at least one rule per cell that fails a file for LACKING something
    dont: reduce a cell's rule set to conditional prohibitions
    harm: with prohibitions alone an empty or degenerate file passes every rule, and the cell collapses into a naming convention — avoiding the cell's own vocabulary becomes the cheapest way to pass
    check: each cell plugin registers at least one rule whose report fires on absence; the leaf names which rule that is
```

## Rule APIs

Two styles exist. Use the one the package already uses; never mix styles inside a package.

```yaml
apis:
  - id: OX-A1
    title: New packages use defineRule
    do: write rules with `defineRule` from `@oxlint/plugins` in `test-hygiene/` and `effect-workflow/`
    dont: import ESLintUtils in these packages
    harm: two rule APIs in one package doubles the reader's mental model
    check: "`import { defineRule } from '@oxlint/plugins'` is the only rule constructor in the package"
  - id: OX-A2
    title: core/ keeps ESLintUtils until a dedicated migration
    do: follow the `ESLintUtils.RuleCreator` shape already used by the rules in `core/src/rules/` when editing `core/`
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
- id: OX-IN1
  title: configs.recommended is a rules bag and nothing else
  do: put only `rules` inside `configs.recommended`, keyed `<PLUGIN_NAME>/<rule-name>`
  dont: add a `plugins` key (or any other key) to `configs.recommended`
  harm: "oxlint's `Plugin` interface is `{ meta?, rules }` and never reads `configs`; its top-level `plugins` field accepts only built-in namespaces, so a JS plugin name there fails config parsing outright with `Unknown plugin: '<name>'` for every consumer who spreads the preset whole"
  check: "review — `Object.keys(configs.recommended)` is exactly `['rules']`. A violation is not silent: every consumer spreading the preset fails config parsing at startup."
```

## Package Deltas

Every `effect-<cell>/` package's spec of record is its `architect-<cell>` skill — that is the
default, not a delta. Listed here only where a package departs from it.

| Package                                         | Leaf delta                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `core/`                                         | ESLintUtils template, ESLint migration notes, legacy commands                                                                    |
| `effect-dmmf/`                                  | No rules of its own, pure re-export — exempt from OX-MG1, gate + rationale in its own leaf (`ED1`, `ED2`)                        |
| `cell-taxonomy/`                                | Sole owner of non-test source filenames (`CT1`); default lists are defaults, not law (`CT2`)                                     |
| `test-placement/`                               | Not enrolled in its own rules (`TP1`), sole owner of test placement (`TP2`)                                                      |
| `effect-entrypoint/`                            | Not a cell — keyed on the exact filename `main.ts` (`EP1`); the two rules that close cell-taxonomy's `main.ts` exemption (`EP2`) |
| `effect-workflow/`                              | Deliberate non-gates                                                                                                             |
| `effect-executor/`                              | Deliberate non-gates                                                                                                             |
| `effect-{acl,handler,adapter,policy,workflow}/` | Each names its OX-OB1 obligation rule                                                                                            |

## Verification

Run in order before claiming done on any rule change:

```bash
pnpm --filter <pkg> test        # RuleTester suites
pnpm --filter <pkg> mutation    # root gate, plus zero Ignored — see OX-MG1
pnpm check                      # root gate, exits 0
```
