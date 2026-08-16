# AGENTS.md — `packages/oxlint-plugins/`

> **Location:** `packages/oxlint-plugins/` — the oxlint plugin family. This file carries the shared rule-authoring conventions for every plugin in this folder; each package leaf carries only its own delta.

## Critical

```yaml
rules:
  - id: OX-MG1
    title: Zero Ignored mutants — stricter than the root score gate
    do: kill every mutant with a distinguishing test or eliminate it with a restructure
    dont: reach the number by ignoring a killable mutant
    harm: the score excludes Ignored from its denominator, so a package can report a passing score while an ignorer absorbs mutants no test kills
    check: "in the Mutation workflow's merged report for the package, `jq '[.. | .status? // empty | select(. == \"Ignored\" or . == \"Survived\" or . == \"NoCoverage\")] | length' reports/mutation-report.json` returns 0 — reading the report, never starting a run (root `AGENTS.md` REPO-D3)"

  - id: OX-MG2
    title: Ignores are declaration data only
    do: register exactly `effect-schema-declarations` in stryker.config.json#ignorers for III.4 declaration data — Symbol.for descriptions, TaggedClass/TaggedError _tag and fields, optionalWith defaults
    dont: author new ignore plugins, add ignore rules for logic mutants, or use `// Stryker disable` comments
    harm: ignore rules pattern-match text, not proofs — they silently suppress mutants that tests would have killed
    check: "`grep -rn 'Stryker disable' src/` returns nothing, and `jq -r '.ignorers // [] | join(\",\")' stryker.config.json` reports an empty list or exactly `effect-schema-declarations`"

  - id: OX-CS1
    title: Static config lives in *.config.ts
    do: place meta, messages, schema, Options, constants, regexes, and message templates in `src/rules/<rule>.config.ts`; keep guards, predicates, selectors, and `create()` in the rule file; pass the imported config `meta` to `defineRule` directly without spread
    dont: declare static config inside the rule file
    harm: static data inflates the mutation surface with equivalent mutants no test can kill; behavior and declaration stop being distinguishable (III.4)
    check: "`jq -r '.mutate | join(\"\\n\")' stryker.config.json` lists a `!*.config.ts` exclusion, and `grep -rn '\\.config\\.js' src/rules/` shows a `meta` import for every rule with a static config"

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
    check: "`pnpm --filter <pkg> test` exits 0, and `pnpm check:lint-coverage` gates the self-hosted `@systemfsoftware/test-hygiene(damp-test-naming)` rule's delivery to every production package — the zero-violation run over the repo's own tests is review"

  - id: OX-TS2
    title: A rule may only depend on facts RuleTester can supply
    do: take project knowledge through `options` or `settings` and read everything else from the linted file's own AST; check such a declaration against a real tree in the plugin's own suite, where the filesystem legally lives
    dont: make a verdict depend on a fact only the disk carries — a sibling file's existence, a directory listing, another package's contents
    harm: RuleTester cannot create a sibling, so a disk-dependent arm never gets a passing valid case and cannot meet OX-MG1. Stating that as a platform limit is false — `Context` carries `cwd`, `physicalFilename`, and `settings`, and a rule runs in Node — and the false version pushes the next author off the lint channel for a rule that was always writable
    check: "`grep -rn 'existsSync\\|statSync\\|readdirSync' src/rules/` returns nothing, and every arm's reachability from a RuleTester case built out of `code`, `filename`, `options`, and `settings` alone is review — `src-property-test-cell`'s `cellsRequiringTest` arm is the worked example"

  - id: OX-OB1
    title: Keep an obligation, not only prohibitions
    do: keep at least one rule per cell that fails a file for LACKING something
    dont: reduce a cell's rule set to conditional prohibitions
    harm: with prohibitions alone an empty or degenerate file passes every rule, and the cell collapses into a naming convention — avoiding the cell's own vocabulary becomes the cheapest way to pass
    check: review — each cell plugin registers at least one rule whose report fires on absence, and the leaf names which rule that is

  - id: OX-DL1
    title: A plugin that imports effect-cell-types is delivered consumer-side, never through the effect-dmmf aggregate
    do: when a plugin under packages/oxlint-plugins/ needs `@systemfsoftware/effect-cell-types` as a dependency, deliver it by adding it to each consuming package's own `jsPlugins` and `rules`, exactly as `cell-vocabulary` is delivered
    dont: add such a plugin to `effect-dmmf/src/index.ts` re-exports, `effect-dmmf/package.json` dependencies, or `oxlint-config/package.json` dependencies — declaring it there closes the turbo cycle `effect-executor -> effect-cell-types -> oxlint-config -> effect-dmmf -> effect-executor`, and the only workaround is a committed generated vocabulary with a drift gate
    harm: the cycle forces a hack (generated constants + regenerate-and-compare gate) that a later reader deletes as cargo cult, leaving the rules frozen on stale constants with no gate; measured on 2026-08-15 when `vocabulary.generated.ts` existed solely because `effect-executor` sat in the aggregate
    check: "`grep -rn 'effect-cell-types' packages/oxlint-plugins/effect-dmmf/src/index.ts` returns nothing, and the remedy is `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md`"

  - id: OX-CI1
    title: A rule matches the canonical identifier only, and its suite proves the alias does not fire
    do: declare each thing a rule matches in its canonical spelling — in this family `S`, `Effect`, `Option`, `Context`, or `Match`, imported under that name
    dont: widen any matcher to an alias (E.fn, C.Tag), another namespace (Schema.TaggedClass, Other.succeed), or a computed member, and never drop the near-miss fixture that keeps such a widening red
    harm: a rule that matches a canonical identifier (`S`, `Effect`, `Option`) rather than an alias is verified by its suite's near-miss valid cases, which exist to prove the non-canonical spelling does NOT fire the rule; widen the match and every one of them passes vacuously, so the suite stops distinguishing the canonical form from the alias it was written to separate
    check: "`grep -rE '(Alias|Aliased|NearMiss|GenericTag|Other\\.)' packages/oxlint-plugins/*/src/rules/__tests__/` returns, per plugin whose rules match a canonical identifier, a fixture naming the non-canonical spelling, and `pnpm --filter <pkg> test` exits 0 in each such plugin"
```

## Rule APIs

- **OX-A1** — new packages use `defineRule` from `@oxlint/plugins`. Gate: `import { defineRule }` is the only constructor.
- **OX-A2** — `core/` has migrated to `defineRule`; no edit rewrites constructor shapes opportunistically. Gate: review.

## Integration

`oxlint-config/src/oxlint-config.base.ts` registers plugins via `jsPlugins: ['@systemfsoftware/oxlint-plugin', ...]`.

- **OX-IN1** — `configs.recommended` contains only `rules: { '<PLUGIN>/rule-name': 'error' }`. Never put `plugins` inside configs. Gate: review — `Object.keys(configs.recommended)` is `['rules']`.

## Runtime Budget

Rule population is gated on two budgets, not on a rule count:

- **Aggregate false positives** — the product of rule count and per-rule
  false-positive rate, not the count itself.
- **Runtime** — rule count times files scanned.

Measured 2026-08-09 on oxlint 1.77.0 against `packages/oxlint-plugins/core`
(52 TypeScript files / 8,038 LoC): type-aware ON 6829 ms, OFF
(`--disable-type-aware`) 1607 ms — 4.25x, +5.2 s.

An enabled-but-unwanted rule is set to `off`, NEVER `warn` — a `warn` rule
still runs and still costs its per-file time. Count is not the axis: there
is no fixed rule-count ceiling, only the two budgets above.

## Package Deltas

Each `effect-<cell>/` package's leaf `AGENTS.md` states its own doctrine and is its spec of
record — the shared conventions in this file are the default, not a delta. Listed here only
where a package departs from them.

| Package                                         | Leaf delta                                                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `core/`                                         | ESLintUtils template, ESLint migration notes, legacy commands                                                                          |
| `property-testing/`                             | Property-test contract rules; no leaf — this file's conventions govern                                                                 |
| `test-hygiene/`                                 | DAMP test naming; no leaf — this file's conventions govern                                                                             |
| `cell-imports/`                                 | Import-boundary rules per cell pair; no leaf — this file's conventions govern                                                          |
| `effect-dmmf/`                                  | No rules of its own, pure re-export — exempt from OX-MG1, gate + rationale in its own leaf (`ED1`, `ED2`)                              |
| `cell-taxonomy/`                                | Sole owner of non-test source filenames (`CT1`); default lists are defaults, not law (`CT2`)                                           |
| `test-placement/`                               | Not enrolled in its own rules (`TP1`), sole owner of test placement (`TP2`)                                                            |
| `effect-entrypoint/`                            | Not a cell — keyed on the exact filename `main.ts` (`EP1`); the two rules that close cell-taxonomy's `main.ts` exemption (`EP2`)       |
| `effect-executor/`                              | Deliberate non-gates; its phase vocabulary is walked off @systemfsoftware/effect-cell-types directly; delivered consumer-side (OX-DL1) |
| `cell-vocabulary/`                              | Not a cell — walks a Cell description for its vocabulary (`CELL-V1`); OX-OB1 does not apply (`CELL-V4`)                                |
| `effect-{acl,handler,adapter,policy,workflow}/` | Each names its OX-OB1 obligation rule                                                                                                  |
