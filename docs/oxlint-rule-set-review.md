# Review: the oxlint rule set

A measured verdict on every rule body under `packages/oxlint-plugins`. Read-only: this document
changes no rule. Measured on 2026-08-09 against the working tree, then adjudicated by a blind
three-reviewer panel whose findings corrected two of the four measurements. See **Panel** below.

## Aggregate verdict

**59 of 111 rules survive. 52 fail a measurement.**

The rule set is not worthless and it is not healthy. Just over half the rule bodies are live,
uniquely shaped, and pointed at a cell that exists here. The rest: **3** cannot fire at all, **18**
are near-copies of another rule enforcing the same constraint, and **31** are live and unique but
police a cell with three files or fewer.

The number that outweighs the split: across **958 source files in 23 packages, this rule set
produced zero diagnostics**. The linter emitted six, all from builtins — `eslint(no-unused-vars)`,
`typescript(no-unsafe-argument)`, `unicorn(no-new-array)`. Not one of the 110 registered rules has
drawn blood on the codebase it governs.

## Thesis

**The rule set has teeth on paper and has never bitten, because 111 rule bodies were authored as
instantiations of one template rather than as answers to observed defects.**

The mechanism is visible in the code. 88 of 111 rules gate on the filename. 54 register exactly one
visitor key. 44 do both: read the filename, bail if the suffix is wrong, visit one node type,
report. `handler-no-switch` and `kernel-no-throw` enforce unrelated constraints and are
**structurally identical** — normalised body similarity **1.00**, against a median of 0.22 across
all 6,105 rule pairs and 0.16–0.18 for deliberately unrelated pairs. The template is so dominant
that two rules with nothing semantically in common produce the same token skeleton.

That matters because a template makes authoring a rule nearly free while doing nothing to make the
rule _necessary_. The population grew to the size the template allowed, not to the size the defect
surface justified. 18 rules govern `.workflow.ts`, of which this repository contains **three
files**. Five rules govern `.store.ts`, of which it contains **zero**. Four `effect-entrypoint`
rules govern `main.ts`, of which it contains **one**. And one rule, `workflow-declaration-form`,
is a complete rule body — `defineRule`, `meta`, `create` — registered in no plugin's rules map,
so no config can name it and no linter can run it.

## Counterargument

**The strongest case against the thesis is that zero diagnostics is the success condition of a
preventive control, and this rule set has the test evidence to prove each rule fires on the input it
was written for.**

A lint rule is not a bug detector whose worth is measured in catches; it is a constraint whose worth
is measured in violations that never got written. Judging it by production firings penalises exactly
the rules that worked. The evidence that these rules _can_ fire is strong, and it comes from the
same measurement pass that produced the thesis: **1,337 invalid cases across 110 test files, 995
error assertions, every one carrying an exact `messageId`, and 865 of them additionally asserting
the interpolated `data`.** No case asserts message prose. Across 110 rules exactly **one** declared
message template is never reported (`no-barrels#barrelFile`). A suite that specific is not
decoration; it is a suite where a one-token mutation of the rule fails a test.

The near-copies have a defensible cause, and it is in this repo's own config. `oxlint` has no type
information, so the base config sets `typescript/no-unsafe-type-assertion`, `no-unsafe-assignment`,
`no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-return` and `no-unsafe-argument` to
**`off`** — six type-aware carriers switched off because the linter cannot run them. The per-cell
cast rules are not duplicating an active builtin; they are hand-rolling a syntactic approximation of
a builtin that does not work here. Under that constraint, several small syntactic rules is the
_available_ design, not a failure of taste.

And low population is a timing artefact, not a defect. A rule for `.store.ts` written before the
first store exists is a rule waiting for its cell, which is the correct order: the constraint should
be in place before the code it governs.

## Rebuttal

The counterargument is right about prevention and right about the tests. It fails on reach, and
reach is a structural property that no amount of per-rule quality repairs.

**These rules do not police the codebase. They police the subset that opted in by filename.** 88 of
111 rules gate on the filename, and those suffixes cover **135 of 756 non-test TypeScript files —
18%**. The other 82% is outside every cell rule's reach by construction, and no rule can be written
to fix that, because the gate _is_ the rule's scope. A constraint that only inspects files whose
author already accepted the constraint is a constraint with no adversary. Prevention presumes a
population that could have violated; here the population is self-selected, and it was self-selected
by the same people who wrote the rules.

The structural failure repeats one level up, in the packaging. 110 distinct rule keys are registered
under **199 fully-qualified rule ids**, because `effect-dmmf` re-exports 89 of them into a second
namespace. Six plugin packages are loaded by some config; **15 of the 21 rule-owning packages are
loaded by nobody**, and **78 of the 108 live rules reach the linter only through the composite**.
The per-cell package boundary — the organising idea the whole taxonomy rests on — has almost no
operational existence. Fifteen packages exist, are versioned, are published, and are loaded by no
config; their rules run only because one composite re-exports them.

That is the difference between a rule set with teeth and a rule set with dentures. The tests prove
the teeth exist. The reach measurement proves they are barely in contact with anything.

## Concession

The counterargument wins on the low-population rules, and it changes 31 verdicts.

My first pass bucketed every rule whose cell has three files or fewer as `DELETE`, on the argument
that a rule with nothing to inspect is indistinguishable from a rule that does not exist. That is
wrong, and the test evidence is what makes it wrong: these rules have real invalid cases with exact
`messageId` and `data` assertions, so they are demonstrably capable of firing the moment a file
appears. Deleting them would discard working, specific, tested constraints to improve a number. All
31 moved from `DELETE` to `DEMOTE`.

A second concession, about my own method: I initially grouped `acl-no-as-casts` with
`adapter-no-cast` and `handler-no-casts`, and `observer-no-escaping-state` with its two siblings,
because the names are obviously kin. The similarity measurement refused it — 0.46 and 0.39 against a
0.70 threshold. Name kinship is not implementation kinship. `acl-no-as-casts` moved from `MERGE` to
`DEMOTE`, and `observer-no-escaping-state` from `MERGE` to `SURVIVES`.

A third, forced on me by the panel and the most serious: **my reach measurement was wrong.** See
**Correction** below. It cost the thesis its sharpest claim — that four rules were unreachable — and
shrank `DELETE` from 8 rules to 3.

## Adjusted thesis

**The rule set's defect is not quality and not authorship: it is reach.** The rules are well tested
and precisely worded, and 59 survive unqualified. But 78 of 108 live rules reach the linter only
through one composite plugin, 15 of 21 rule-owning packages are loaded by no config, 82% of the
codebase sits outside every filename gate, and the whole set has produced zero diagnostics on 958
files. The next honest change is not another rule. It is deleting the 3 that cannot fire, collapsing
the 18 near-copies into 9 parameterised rules, and deciding whether the 15 unloaded packages should
be loaded or removed.

## Correction

The blind panel found a defect in **M1 reach**, and it invalidated part of my first draft. I
recorded it rather than quietly restating the numbers.

My first M1 pass imported each of the 23 `oxlint.config.ts` files at runtime to read its effective
rule set. Six of those imports threw `import.meta.resolve is not a function` under the harness I
used. I scored a config that failed to load as a config that names nothing. That is a **false
negative that only ever removes reach**, and the six failures were exactly the six configs that load
a plugin beyond the base composite.

Consequences, all now fixed:

- **The four `effect-entrypoint` rules are not unreachable.** `packages/stryker-js/cli/oxlint.config.ts`
  loads the plugin and spreads its recommended rules. They are live, and they address exactly one
  file (`packages/stryker-js/cli/src/main.ts`), so they are `DEMOTE`, not `DELETE`.
- **`no-manual-tag-member` is not unenabled.** It is named at `error`, with options, in
  `packages/effect-atom/atom/oxlint.config.ts` and `packages/storybook-gherkin/oxlint.config.ts`,
  and recommended by its own plugin. 16 files are in scope, so it `SURVIVES`.
- **Six plugin packages are loaded, not three** — adding `effect-schema`, `effect-entrypoint` and
  `test-placement` to `core`, `cell-taxonomy` and the composite.
- **108 of 111 rules are live, not 103.** `DELETE` fell from 8 to 3.

M1 was re-derived by parsing every config with `oxc-parser` and resolving `jsPlugins` entries,
literal rule ids, `...plugin.configs.recommended.rules` spreads, and the `extends` chain
statically. No runtime import, so no config can fail silently. Two of the three reviewers found this
independently; one of them followed the supplied measurement to the wrong bucket while flagging in
writing that it was "the weakest reach call in the set".

I also had to restore a condition I had dropped while re-bucketing: `MERGE` requires same-constraint
family membership **and** similarity ≥ 0.70. Raw similarity alone put `handler-no-switch` in
`MERGE` against `kernel-no-throw` at 1.00 — which would have merged two rules that ban different
things, contradicting the thesis those very rules are the evidence for. All three reviewers
independently placed `handler-no-switch` in `SURVIVES`.

## Panel

30 of the 111 rules were drawn as a stratified sample — 5 `DELETE`, 5 `MERGE`, 6 `DEMOTE`, 14
`SURVIVES`, selected by even spread over a lexicographic sort so the draw is reproducible. Three
reviewers judged them independently, from an evidence pack carrying the rubric and the four
measurements but **no verdict of mine**, and were instructed to cite evidence before naming a bucket.

| Measure                                 | Result             |
| --------------------------------------- | ------------------ |
| Unanimous (3 of 3)                      | **27 / 30 = 90%**  |
| At least 2 of 3                         | **30 / 30 = 100%** |
| Fleiss κ (3 raters, 4 categories)       | **0.90**           |
| Pairwise: adversarial vs correctness    | 29 / 30 = 97%      |
| Pairwise: adversarial vs generalist     | 28 / 30 = 93%      |
| Pairwise: correctness vs generalist     | 27 / 30 = 90%      |
| Each reviewer vs the corrected verdicts | 93%, 90%, 100%     |

**The verdict is upheld.** Every disagreement — all three of them — fell on the M1 defect above:
`entrypoint-no-exports`, `entrypoint-not-imported`, `no-manual-tag-member`. On the other 27 rules
the panel was unanimous and matched this review exactly. One reviewer disclosed incidental
contamination: a repo-wide grep surfaced reach lines from an earlier draft of this file; it reported
seeing no bucket verdicts.

## Findings

1. **Zero production firings.** 958 files, 23 configs, 6 diagnostics, none from these 110 rules.
2. **One rule is registered nowhere.** `workflow-declaration-form` is a complete rule body bound to
   no plugin. No config can name it, and it has no test cases.
3. **Two rules are reachable but named by no config.** `no-bodyless-status-assertion` and
   `workflow-inline-schemas` — the latter registered by its plugin but deliberately left out of the
   recommended set.
4. **The package taxonomy is nearly inert.** 6 of 21 rule-owning plugins are loaded by any config;
   78 of 108 live rules reach the linter only through the `effect-dmmf` composite. 199
   fully-qualified ids exist for 110 rule keys.
5. **18% coverage.** The filename gates address 135 of 756 non-test TypeScript files.
6. **One dead message template** in 110 rules: `no-barrels#barrelFile` is declared and never
   reported. The suites are otherwise clean.

## How each verdict was reached

Criteria applied in order; the first that matches wins, so no rule carries two buckets.

| Order | Bucket     | Condition                                                                                                                                                                                          |
| ----- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `DELETE`   | The rule cannot fire here: registered in no plugin, or no loaded plugin's namespace is named by any config.                                                                                        |
| 2     | `MERGE`    | The rule belongs to a named same-constraint family **and** scores **≥ 0.70** normalised body similarity to a family sibling, against unrelated pairs at 0.16–0.18 and an all-pairs median of 0.22. |
| 3     | `DEMOTE`   | The rule is live and unique, but **≤ 3 files** in this repository can match its filename gate.                                                                                                     |
| 4     | `SURVIVES` | Everything else.                                                                                                                                                                                   |

## What was measured

| Tag    | Measurement   | Method                                                                                                                                                                                                                                                 |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M1** | reach         | Every config parsed with `oxc-parser`; `jsPlugins`, literal rule ids, `configs.recommended.rules` spreads and the `extends` chain resolved statically. A rule is live only when a config loads a plugin registering it **and** names its qualified id. |
| **M2** | firing        | `oxlint` run over all 23 configured packages, JSON output, diagnostics counted per rule code. Addressable population counted by walking the tree for each cell suffix.                                                                                 |
| **M3** | test strength | Every rule and test file parsed with `oxc-parser` — the parser `oxlint` itself uses. Cases counted from the `valid`/`invalid` arrays; assertions inspected for `messageId` and `data`; error factories resolved to their definitions.                  |
| **M4** | redundancy    | All 6,105 rule-body pairs compared by 5-token shingle Jaccard over a type-normalised token stream, with declared-vs-reported message ids and the enabled builtin set cross-checked.                                                                    |

Nothing here rests on a regex over source text, and nothing rests on a runtime import that can fail
open. Two earlier regex passes produced false counts — reading `data: { name: … }` as a test case,
and message templates as message ids — and a runtime import pass produced the M1 defect above. Each
was discarded once a parser disagreed with it.

## Per-rule verdicts

### DELETE — 3 rules

| Rule                           | Package         | M1 reach                                              | M2 firing                 | M3 tests          | M4 redundancy |
| ------------------------------ | --------------- | ----------------------------------------------------- | ------------------------- | ----------------- | ------------- |
| `no-bodyless-status-assertion` | core            | **cannot fire** — no config names it                  | 0 fired / n-a addressable | 7v 5i, ids        | no near-copy  |
| `workflow-declaration-form`    | effect-workflow | **cannot fire** — registered in no plugin's rules map | 0 fired / 3 addressable   | 0v 0i, no ids     | no near-copy  |
| `workflow-inline-schemas`      | effect-workflow | **cannot fire** — no config names it                  | 0 fired / 3 addressable   | 13v 6i, ids +data | no near-copy  |

### MERGE — 18 rules

| Rule                              | Package         | M1 reach           | M2 firing                 | M3 tests           | M4 redundancy                                                                    |
| --------------------------------- | --------------- | ------------------ | ------------------------- | ------------------ | -------------------------------------------------------------------------------- |
| `no-native-map-in-effect`         | core            | live via core      | 0 fired / n-a addressable | 15v 11i, ids +data | near-copy: no-native-set-in-effect 0.86 (native-global-banned-in-effect)         |
| `no-native-set-in-effect`         | core            | live via core      | 0 fired / n-a addressable | 13v 10i, ids +data | near-copy: no-native-map-in-effect 0.86 (native-global-banned-in-effect)         |
| `no-native-setinterval-in-effect` | core            | live via core      | 0 fired / n-a addressable | 9v 15i, ids +data  | near-copy: no-native-settimeout-in-effect 0.84 (native-global-banned-in-effect)  |
| `no-native-settimeout-in-effect`  | core            | live via core      | 0 fired / n-a addressable | 8v 12i, ids +data  | near-copy: no-native-setinterval-in-effect 0.84 (native-global-banned-in-effect) |
| `acl-no-anti-pattern-path`        | effect-acl      | live via composite | 0 fired / 3 addressable   | 8v 8i, ids +data   | near-copy: shape-no-anti-pattern-path 0.9 (anti-pattern-path)                    |
| `adapter-no-cast`                 | effect-adapter  | live via composite | 0 fired / 6 addressable   | 6v 5i, ids +data   | near-copy: handler-no-casts 0.85 (ban-as-cast)                                   |
| `executor-no-domain-branch`       | effect-executor | live via composite | 0 fired / 23 addressable  | 19v 14i, ids +data | near-copy: store-no-domain-branch 0.98 (no-domain-branch)                        |
| `executor-no-escaping-state`      | effect-executor | live via composite | 0 fired / 23 addressable  | 16v 11i, ids +data | near-copy: store-no-escaping-state 0.84 (no-escaping-state)                      |
| `handler-no-casts`                | effect-handler  | live via composite | 0 fired / 5 addressable   | 5v 5i, ids +data   | near-copy: adapter-no-cast 0.85 (ban-as-cast)                                    |
| `handler-single-handler-export`   | effect-handler  | live via composite | 0 fired / 5 addressable   | 23v 38i, ids +data | near-copy: workflow-single-function-export 0.79 (single-export-per-file)         |
| `kernel-no-ambient-impurity`      | effect-kernel   | live via composite | 0 fired / 62 addressable  | 33v 17i, ids +data | near-copy: workflow-no-ambient-impurity 0.94 (no-ambient-impurity)               |
| `kernel-no-throw`                 | effect-kernel   | live via composite | 0 fired / 62 addressable  | 8v 3i, ids +data   | near-copy: workflow-no-throw 0.77 (no-throw)                                     |
| `shape-no-anti-pattern-path`      | effect-shape    | live via composite | 0 fired / 3 addressable   | 8v 8i, ids +data   | near-copy: acl-no-anti-pattern-path 0.9 (anti-pattern-path)                      |
| `store-no-domain-branch`          | effect-store    | live via composite | 0 fired / 0 addressable   | 16v 10i, ids +data | near-copy: executor-no-domain-branch 0.98 (no-domain-branch)                     |
| `store-no-escaping-state`         | effect-store    | live via composite | 0 fired / 0 addressable   | 11v 8i, ids +data  | near-copy: executor-no-escaping-state 0.84 (no-escaping-state)                   |
| `workflow-no-ambient-impurity`    | effect-workflow | live via composite | 0 fired / 3 addressable   | 33v 17i, ids +data | near-copy: kernel-no-ambient-impurity 0.94 (no-ambient-impurity)                 |
| `workflow-no-throw`               | effect-workflow | live via composite | 0 fired / 3 addressable   | 5v 3i, ids +data   | near-copy: kernel-no-throw 0.77 (no-throw)                                       |
| `workflow-single-function-export` | effect-workflow | live via composite | 0 fired / 3 addressable   | 20v 30i, ids +data | near-copy: handler-single-handler-export 0.79 (single-export-per-file)           |

### DEMOTE — 31 rules

| Rule                                      | Package           | M1 reach                   | M2 firing               | M3 tests           | M4 redundancy                                                    |
| ----------------------------------------- | ----------------- | -------------------------- | ----------------------- | ------------------ | ---------------------------------------------------------------- |
| `acl-no-as-casts`                         | effect-acl        | live via composite         | 0 fired / 3 addressable | 10v 9i, ids +data  | family sibling handler-no-casts 0.46 — below 0.70                |
| `acl-single-transform-export`             | effect-acl        | live via composite         | 0 fired / 3 addressable | 15v 18i, ids +data | family sibling workflow-single-function-export 0.51 — below 0.70 |
| `acl-transform-orfail-required`           | effect-acl        | live via composite         | 0 fired / 3 addressable | 8v 8i, ids +data   | no near-copy                                                     |
| `entrypoint-interprets-once`              | effect-entrypoint | live via effect-entrypoint | 0 fired / 1 addressable | 10v 8i, ids +data  | no near-copy                                                     |
| `entrypoint-no-exports`                   | effect-entrypoint | live via effect-entrypoint | 0 fired / 1 addressable | 5v 6i, ids +data   | no near-copy                                                     |
| `entrypoint-no-promise-wrapper`           | effect-entrypoint | live via effect-entrypoint | 0 fired / 1 addressable | 16v 2i, ids +data  | no near-copy                                                     |
| `entrypoint-not-imported`                 | effect-entrypoint | live via effect-entrypoint | 0 fired / 1 addressable | 7v 7i, ids +data   | no near-copy                                                     |
| `middleware-gate-fails-on-decode-failure` | effect-middleware | live via composite         | 0 fired / 2 addressable | 33v 15i, ids +data | no near-copy                                                     |
| `middleware-no-operation-imports`         | effect-middleware | live via composite         | 0 fired / 2 addressable | 10v 6i, ids +data  | no near-copy                                                     |
| `middleware-single-middleware-export`     | effect-middleware | live via composite         | 0 fired / 2 addressable | 17v 19i, ids +data | family sibling workflow-single-function-export 0.65 — below 0.70 |
| `policy-combinator-export`                | effect-policy     | live via composite         | 0 fired / 2 addressable | 18v 22i, ids +data | no near-copy                                                     |
| `policy-no-error-rewriting`               | effect-policy     | live via composite         | 0 fired / 2 addressable | 10v 9i, ids +data  | no near-copy                                                     |
| `policy-no-junk-drawer-path`              | effect-policy     | live via composite         | 0 fired / 2 addressable | 8v 6i, ids +data   | family sibling kernel-no-junk-drawer-name 0.51 — below 0.70      |
| `shape-no-behaviour`                      | effect-shape      | live via composite         | 0 fired / 3 addressable | 9v 10i, ids +data  | no near-copy                                                     |
| `shape-one-foreign-system`                | effect-shape      | live via composite         | 0 fired / 3 addressable | 10v 4i, ids +data  | no near-copy                                                     |
| `store-acl-required`                      | effect-store      | live via composite         | 0 fired / 0 addressable | 10v 8i, ids +data  | no near-copy                                                     |
| `store-effect-fn-required`                | effect-store      | live via composite         | 0 fired / 0 addressable | 13v 14i, ids +data | no near-copy                                                     |
| `store-no-driver-construction`            | effect-store      | live via composite         | 0 fired / 0 addressable | 15v 13i, ids +data | no near-copy                                                     |
| `workflow-command-object`                 | effect-workflow   | live via composite         | 0 fired / 3 addressable | 7v 13i, ids +data  | no near-copy                                                     |
| `workflow-either-inhabited`               | effect-workflow   | live via composite         | 0 fired / 3 addressable | 13v 16i, ids +data | no near-copy                                                     |
| `workflow-match-exhaustive`               | effect-workflow   | live via composite         | 0 fired / 3 addressable | 19v 13i, ids +data | no near-copy                                                     |
| `workflow-no-async`                       | effect-workflow   | live via composite         | 0 fired / 3 addressable | 6v 6i, ids +data   | no near-copy                                                     |
| `workflow-no-effect-import`               | effect-workflow   | live via composite         | 0 fired / 3 addressable | 12v 14i, ids +data | no near-copy                                                     |
| `workflow-no-panic-vocabulary`            | effect-workflow   | live via composite         | 0 fired / 3 addressable | 11v 5i, ids +data  | no near-copy                                                     |
| `workflow-no-unconstructed-variant`       | effect-workflow   | live via composite         | 0 fired / 3 addressable | 19v 11i, ids +data | no near-copy                                                     |
| `workflow-property-test-shape`            | effect-workflow   | live via composite         | 0 fired / 3 addressable | 20v 2i, ids +data  | no near-copy                                                     |
| `workflow-schema-required`                | effect-workflow   | live via composite         | 0 fired / 3 addressable | 12v 21i, ids +data | no near-copy                                                     |
| `workflow-single-path`                    | effect-workflow   | live via composite         | 0 fired / 3 addressable | 6v 8i, ids +data   | no near-copy                                                     |
| `workflow-typeid-required`                | effect-workflow   | live via composite         | 0 fired / 3 addressable | 17v 7i, ids +data  | no near-copy                                                     |
| `workflow-typeid-shared-per-union`        | effect-workflow   | live via composite         | 0 fired / 3 addressable | 18v 3i, ids +data  | no near-copy                                                     |
| `workflow-union-schema-declared`          | effect-workflow   | live via composite         | 0 fired / 3 addressable | 10v 3i, ids +data  | no near-copy                                                     |

### SURVIVES — 59 rules

| Rule                               | Package          | M1 reach                            | M2 firing                 | M3 tests           | M4 redundancy                                                    |
| ---------------------------------- | ---------------- | ----------------------------------- | ------------------------- | ------------------ | ---------------------------------------------------------------- |
| `cell-import-boundary`             | cell-imports     | live via composite                  | 0 fired / n-a addressable | 36v 34i, ids +data | no near-copy                                                     |
| `capability-named-directory`       | cell-taxonomy    | live via cell-taxonomy              | 0 fired / n-a addressable | 11v 19i, ids +data | no near-copy                                                     |
| `cell-suffix-required`             | cell-taxonomy    | live via composite                  | 0 fired / n-a addressable | 19v 11i, ids +data | no near-copy                                                     |
| `ban-classes`                      | core             | live via core                       | 0 fired / n-a addressable | 18v 24i, ids +data | no near-copy                                                     |
| `ban-error-string`                 | core             | live via core                       | 0 fired / n-a addressable | 4v 4i, ids +data   | no near-copy                                                     |
| `no-barrels`                       | core             | live via core                       | 0 fired / n-a addressable | 22v 36i, ids +data | no near-copy                                                     |
| `no-context-generic-tag`           | core             | live via core                       | 0 fired / n-a addressable | 16v 10i, ids +data | no near-copy                                                     |
| `no-date-now-in-effect`            | core             | live via core                       | 0 fired / n-a addressable | 12v 11i, ids +data | no near-copy                                                     |
| `no-direct-tag-access`             | core             | live via core                       | 0 fired / n-a addressable | 17v 10i, ids +data | no near-copy                                                     |
| `no-either-tag-assertions`         | core             | live via core                       | 0 fired / n-a addressable | 55v 44i, ids +data | no near-copy                                                     |
| `no-inline-destructured-type`      | core             | live via core                       | 0 fired / n-a addressable | 15v 13i, ids +data | no near-copy                                                     |
| `no-io-boundary-tests`             | core             | live via core                       | 0 fired / n-a addressable | 11v 13i, ids       | no near-copy                                                     |
| `no-logging-in-catch`              | core             | live via core                       | 0 fired / n-a addressable | 56v 35i, ids +data | no near-copy                                                     |
| `no-new-promise-in-effect`         | core             | live via core                       | 0 fired / n-a addressable | 8v 8i, ids +data   | family sibling no-new-worker-with-wasm-import 0.63 — below 0.70  |
| `no-new-worker-with-wasm-import`   | core             | live via core                       | 0 fired / n-a addressable | 9v 8i, ids +data   | family sibling no-new-promise-in-effect 0.63 — below 0.70        |
| `adapter-layer-required`           | effect-adapter   | live via composite                  | 0 fired / 6 addressable   | 7v 12i, ids +data  | no near-copy                                                     |
| `adapter-single-external-system`   | effect-adapter   | live via composite                  | 0 fired / 6 addressable   | 13v 11i, ids +data | no near-copy                                                     |
| `adapter-single-layer-export`      | effect-adapter   | live via composite                  | 0 fired / 6 addressable   | 14v 22i, ids +data | family sibling workflow-single-function-export 0.34 — below 0.70 |
| `executor-deps-borrowed-types`     | effect-executor  | live via composite                  | 0 fired / 23 addressable  | 20v 5i, ids +data  | no near-copy                                                     |
| `executor-deps-tag-name`           | effect-executor  | live via composite                  | 0 fired / 23 addressable  | 20v 5i, ids +data  | no near-copy                                                     |
| `executor-no-io-in-filling`        | effect-executor  | live via composite                  | 0 fired / 23 addressable  | 11v 7i, ids +data  | no near-copy                                                     |
| `executor-no-layer-binding`        | effect-executor  | live via composite                  | 0 fired / 23 addressable  | 22v 10i, ids +data | no near-copy                                                     |
| `executor-owns-context-tag`        | effect-executor  | live via composite                  | 0 fired / 23 addressable  | 15v 7i, ids +data  | no near-copy                                                     |
| `executor-requires-deps-tag`       | effect-executor  | live via composite                  | 0 fired / 23 addressable  | 5v 12i, ids +data  | no near-copy                                                     |
| `executor-single-operation-export` | effect-executor  | live via composite                  | 0 fired / 23 addressable  | 29v 25i, ids +data | family sibling acl-single-transform-export 0.32 — below 0.70     |
| `handler-match-tag-or-else`        | effect-handler   | live via composite                  | 0 fired / 5 addressable   | 14v 5i, ids +data  | no near-copy                                                     |
| `handler-no-switch`                | effect-handler   | live via composite                  | 0 fired / 5 addressable   | 3v 3i, ids +data   | no near-copy                                                     |
| `handler-single-executor`          | effect-handler   | live via composite                  | 0 fired / 5 addressable   | 6v 6i, ids +data   | no near-copy                                                     |
| `kernel-no-effect-runtime`         | effect-kernel    | live via composite                  | 0 fired / 62 addressable  | 15v 12i, ids +data | no near-copy                                                     |
| `kernel-no-junk-drawer-name`       | effect-kernel    | live via composite                  | 0 fired / 62 addressable  | 9v 10i, ids +data  | family sibling acl-no-anti-pattern-path 0.55 — below 0.70        |
| `observer-no-escaping-state`       | effect-observer  | live via composite                  | 0 fired / 4 addressable   | 13v 14i, ids +data | family sibling executor-no-escaping-state 0.39 — below 0.70      |
| `observer-operational-exports`     | effect-observer  | live via composite                  | 0 fired / 4 addressable   | 14v 11i, ids +data | no near-copy                                                     |
| `ban-data-taggederror`             | effect-schema    | live via composite                  | 0 fired / 16 addressable  | 17v 34i, ids +data | no near-copy                                                     |
| `ban-effect-schema-imports`        | effect-schema    | live via composite                  | 0 fired / 16 addressable  | 6v 8i, ids +data   | no near-copy                                                     |
| `no-manual-tag-member`             | effect-schema    | live via effect-schema              | 0 fired / 16 addressable  | 16v 13i, ids +data | no near-copy                                                     |
| `no-manual-tag-property`           | effect-schema    | live via composite                  | 0 fired / 16 addressable  | 13v 11i, ids +data | no near-copy                                                     |
| `no-schema-law-duplicate`          | effect-schema    | live via composite                  | 0 fired / 16 addressable  | 6v 3i, ids +data   | no near-copy                                                     |
| `schema-exports-only-schemas`      | effect-schema    | live via composite                  | 0 fired / 16 addressable  | 21v 28i, ids +data | no near-copy                                                     |
| `state-no-raw-primitive-exports`   | effect-state     | live via composite                  | 0 fired / 6 addressable   | 16v 15i, ids +data | no near-copy                                                     |
| `state-quarantine-holds-state`     | effect-state     | live via composite                  | 0 fired / 6 addressable   | 19v 8i, ids +data  | no near-copy                                                     |
| `state-single-tag-export`          | effect-state     | live via composite                  | 0 fired / 6 addressable   | 19v 7i, ids +data  | family sibling acl-single-transform-export 0.25 — below 0.70     |
| `no-assert-in-property`            | property-testing | live via composite                  | 0 fired / n-a addressable | 9v 11i, ids +data  | no near-copy                                                     |
| `no-nested-quantification`         | property-testing | live via composite                  | 0 fired / n-a addressable | 14v 17i, ids +data | no near-copy                                                     |
| `no-silent-return`                 | property-testing | live via composite                  | 0 fired / n-a addressable | 36v 33i, ids +data | no near-copy                                                     |
| `no-unbounded-fanout`              | property-testing | live via composite                  | 0 fired / n-a addressable | 17v 28i, ids +data | no near-copy                                                     |
| `property-file-purity`             | property-testing | live via composite                  | 0 fired / n-a addressable | 15v 16i, ids +data | no near-copy                                                     |
| `require-effect-fastcheck`         | property-testing | live via composite                  | 0 fired / n-a addressable | 8v 6i, ids +data   | no near-copy                                                     |
| `damp-test-naming`                 | test-hygiene     | live via composite                  | 0 fired / n-a addressable | 23v 17i, ids +data | no near-copy                                                     |
| `no-behaviourless-assertion`       | test-hygiene     | live via composite                  | 0 fired / n-a addressable | 10v 5i, ids        | no near-copy                                                     |
| `no-unrun-effect-test`             | test-hygiene     | live via composite                  | 0 fired / n-a addressable | 13v 6i, ids        | no near-copy                                                     |
| `pbt-naming`                       | test-hygiene     | live via composite                  | 0 fired / n-a addressable | 22v 20i, ids +data | no near-copy                                                     |
| `behaviour-exercises-use-case`     | test-placement   | live via composite + test-placement | 0 fired / n-a addressable | 12v 5i, ids +data  | no near-copy                                                     |
| `behaviour-one-feature-per-file`   | test-placement   | live via composite + test-placement | 0 fired / n-a addressable | 8v 5i, ids +data   | no near-copy                                                     |
| `behaviour-test-requires-gherkin`  | test-placement   | live via composite + test-placement | 0 fired / n-a addressable | 3v 5i, ids +data   | no near-copy                                                     |
| `in-source-test-targets-private`   | test-placement   | live via composite + test-placement | 0 fired / n-a addressable | 10v 7i, ids +data  | no near-copy                                                     |
| `no-test-file-in-src`              | test-placement   | live via composite + test-placement | 0 fired / n-a addressable | 12v 15i, ids +data | no near-copy                                                     |
| `src-property-test-cell`           | test-placement   | live via composite + test-placement | 0 fired / n-a addressable | 13v 6i, ids +data  | no near-copy                                                     |
| `test-file-outside-tests-dir`      | test-placement   | live via composite + test-placement | 0 fired / n-a addressable | 3v 3i, ids +data   | no near-copy                                                     |
| `test-suffix-outside-src`          | test-placement   | live via composite + test-placement | 0 fired / n-a addressable | 4v 6i, ids +data   | no near-copy                                                     |
