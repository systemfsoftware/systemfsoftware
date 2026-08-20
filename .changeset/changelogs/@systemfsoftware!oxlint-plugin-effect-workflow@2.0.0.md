## 2.0.0

### Major Changes

- `make-body-purity` reports every import referenced inside a `Workflow.make` body, except the sealed pure `effect` surface. A decision is the innermost point of the sandwich, so imports run toward it and never out of it: the reader imports the workflow, and nothing sits beneath the pure core. A body reaching a sibling module invents a layer there whose purity nothing checks — this rule visits make bodies only, so it never reads the module the body reached.

  The rule previously exempted eight relative specifiers, which is why such a body could pass. The exemption keyed on the filename an author typed, so adding a line certified a module without reading it, renaming a file un-certified one whose contents had not changed, and a specifier like `./Survivors.js` certified that name in any package in any directory.

  Expect new findings in any package whose decision bodies call helpers from neighbouring modules. Each has two resolutions: move the referenced code into the deciding file, or move the decision into the file that already holds the code. One decision, one file. Passing the helper in as a parameter is not a third option — a pure helper does not earn a requirement. Where the reference is a decoder, the decode belongs at the edge and its result passes into the decision as data.

- The core regime keys on the `Workflow.make` boundary; the complement gains a complexity ceiling.

  - `workflow-match-exhaustive` no longer reads the filename: the gate is the make callee boundary
    (import binding + member `make` + argument containment, module-scope references followed,
    shadow-correct). Identical dispatch outside a make body produces no diagnostic.
  - New `make-body-purity`: references inside make bodies resolve only to parameters, const locals,
    and audited-pure imports; control flow is banned with the one first-statement converging guard;
    unclassifiable references report honestly as unresolvable rather than passing. Test files are
    exempt — fixtures exercise decisions without the production regime binding them.
  - New `no-domain-branching-density` in core: per-function McCabe CC outside make bodies, ceiling
    17 — the lowest measured value the tree passes with zero waivers (max measured 17; the 15
    functions over 10 are the recorded extraction backlog, not retrofit targets).
  - Both make-boundary rules fix classifier defects their first workspace run exposed: builtin
    globals with empty defs take the named-global triage, and `as const` type subtrees leave the
    value-reference walk.

- Thirteen `workflow-*` rules are removed, and with them two AST helpers that had no other consumer. `effect-workflow` now ships five rules; `effect-dmmf` re-exports the smaller set.

  Removed: `workflow-single-function-export`, `workflow-command-object`, `workflow-declaration-form`, `workflow-schema-required`, `workflow-either-inhabited`, `workflow-typeid-required`, `workflow-typeid-shared-per-union`, `workflow-union-schema-declared`, `workflow-no-unconstructed-variant`, `workflow-no-throw`, `workflow-no-async`, `workflow-single-path`, `workflow-no-ambient-impurity`.

  Kept: `workflow-no-panic-vocabulary`, `workflow-match-exhaustive`, `workflow-no-effect-import` and `workflow-property-test-shape` in `configs.recommended`, plus `workflow-inline-schemas` registered but not recommended.

  Every removal names what refuses the violation instead. Three are refused by `Workflow.make`'s own constructor types, which reject a workflow whose error channel is `never` (`__WORKFLOW_ERROR_CHANNEL_IS_NEVER__`), one whose decision channel is (`__WORKFLOW_DECISION_CHANNEL_IS_NEVER__`), and an error carrying no `_tag` to dispatch on (`__WORKFLOW_ERROR_CHANNEL_CARRIES_NO_TAG__`) — the diagnostic arrives at the construction site, names its own fix, and travels to consumers through the type rather than through an installed lint config. Five more are compiler diagnostics already at `error` in `packages/tsconfig/effect.json`: `asyncFunction` covers `workflow-no-async`, and `globalFetchInEffect`, `globalDateInEffect`, `globalRandomInEffect` and `processEnvInEffect` cover `workflow-no-ambient-impurity`. What survives as a lint rule is what neither mechanism can see: an import edge, an identifier's vocabulary, and one rule over hand-authored test files.

  The remaining removals are deliberately unenforced rather than re-homed. `workflow-no-throw` and the declaration-shape rules asserted properties no type refuses and no diagnostic reports, and each was keyed on a filename, so it never fired on the violation it existed to catch. `docs/2026-08-15-orphaned-cell-constraints.md` records every one with what owning it would take.

  Consumers spreading `configs.recommended` need no change; a config naming a removed rule by key must drop that key.

### Minor Changes

- Three new rules, a retargeted test-placement taxonomy, and one removal.

  `make-file-location` allows a workflow constructor only in the workflow module that owns it, at most once per module.

  `schema-declaration-location` requires a schema declaration to live in a schema module, or the workflow module that owns it. A binding whose initializer returns something other than a schema — a type guard, a decoder, an encoder, an arbitrary — is a use and is not reported.

  `test-placement` narrows which tests may sit beside source, requires every other test to live in the package test directory, and adds `tests-dir-helpers-in-fixtures`. It also removes `in-source-test-targets-private`, which `effect-dmmf` no longer re-exports — drop the entry if you set it. Each rule reports the exact shape it expects.

### Patch Changes

- Remove citations to specs that do not exist

  Each leaf cited a `skill://architect-<cell>` spec, an id minted inside one, or a gate
  this repo no longer carries. None of those resolve — no `architect-*` skill exists, and
  the ids lived in an operator-layer file that could never ship with the clone.

  Two `meta.docs.description` strings in `effect-middleware` are the consumer-visible half
  of this: they ended in a parenthetical naming a spec the consumer cannot read. Each
  sentence already stated its constraint in full, so the citation was the only part removed.

  Where a citation carried content — which constraints a package deliberately leaves to
  review, and why each is out of mechanical reach — the constraint is now named in place
  instead of pointed at.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- State the canonical-identifier contract once

  Six leaves carried the same rule: a rule matches the canonical identifier only, its suite
  carries a near-miss valid case proving the alias does not fire, and widening the match makes
  every one of those cases pass vacuously. It now lives once in the hub leaf that governs the
  whole family, so a leaf below inherits it rather than restating it.

  One clause was genuinely package-specific and stayed: a computed `Effect['fn']` still counts
  as an exported `Effect` value under `store-effect-fn-required`, which the shared rule does
  not say.

  Also corrects the turbo cycle recorded in two places. Both chains from `effect-executor` to
  `effect-dmmf` are real — `effect-cell-types` dev-depends on `oxlint-config` directly and
  again through `effect-gherkin-spec` — so the two were true at different granularity rather
  than in conflict, and both now say so. The closing edge is absent today; the rules exist to
  keep it absent.
