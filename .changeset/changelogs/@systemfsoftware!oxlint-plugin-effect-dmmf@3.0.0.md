## 3.0.0

### Major Changes

- The cell-role suffix rule fleet is deleted, and the aggregate shrinks with it.

  The thirteen plugin packages keyed on the sanctioned cell-role suffixes (`acl`, `adapter`,
  `executor`, `handler`, `kernel`, `middleware`, `observer`, `policy`, `schema`, `shape`, `state`,
  `store`, `workflow`) are gone, so `effect-dmmf` — the aggregate every cell diagnostic is reported
  under — loses those members wholesale, and `effect-schema` loses `schema-exports-only-schemas` and
  `no-manual-tag-member` (`.schema.ts` and `.shape.ts` are in the sanctioned vocabulary). Also gone:
  `effect-workflow`'s four suffix-gated rules. Every representative violation of a deleted class
  compiles clean under strict after the deletion — the refusing channel is none, recorded unowned in
  `docs/solutions/architecture-patterns/cell-suffix-fleet-deleted-unowned.md`. What replaced the
  suffix is the `Workflow.make` boundary: the brand forces the constructor, the lint keys on it, the
  ignorer selects the mutation population from it.

  The thirteen deleted package names should be `npm deprecate`d at publish time (the packages are
  removed from the workspace; their last published versions keep working for existing installs).

  `effect-entrypoint` survives (its rules gate on the `main.ts` basename the taxonomy never owned),
  as do `cell-vocabulary`, `test-placement`, `test-hygiene`, `property-testing`, and core's
  non-filename rules.

- `make-body-purity` reports every import referenced inside a `Workflow.make` body, except the sealed pure `effect` surface. A decision is the innermost point of the sandwich, so imports run toward it and never out of it: the reader imports the workflow, and nothing sits beneath the pure core. A body reaching a sibling module invents a layer there whose purity nothing checks — this rule visits make bodies only, so it never reads the module the body reached.

  The rule previously exempted eight relative specifiers, which is why such a body could pass. The exemption keyed on the filename an author typed, so adding a line certified a module without reading it, renaming a file un-certified one whose contents had not changed, and a specifier like `./Survivors.js` certified that name in any package in any directory.

  Expect new findings in any package whose decision bodies call helpers from neighbouring modules. Each has two resolutions: move the referenced code into the deciding file, or move the decision into the file that already holds the code. One decision, one file. Passing the helper in as a parameter is not a third option — a pure helper does not earn a requirement. Where the reference is a decoder, the decode belongs at the edge and its result passes into the decision as data.

- Three new rules, a retargeted test-placement taxonomy, and one removal.

  `make-file-location` allows a workflow constructor only in the workflow module that owns it, at most once per module.

  `schema-declaration-location` requires a schema declaration to live in a schema module, or the workflow module that owns it. A binding whose initializer returns something other than a schema — a type guard, a decoder, an encoder, an arbitrary — is a use and is not reported.

  `test-placement` narrows which tests may sit beside source, requires every other test to live in the package test directory, and adds `tests-dir-helpers-in-fixtures`. It also removes `in-source-test-targets-private`, which `effect-dmmf` no longer re-exports — drop the entry if you set it. Each rule reports the exact shape it expects.

- Thirteen `workflow-*` rules are removed, and with them two AST helpers that had no other consumer. `effect-workflow` now ships five rules; `effect-dmmf` re-exports the smaller set.

  Removed: `workflow-single-function-export`, `workflow-command-object`, `workflow-declaration-form`, `workflow-schema-required`, `workflow-either-inhabited`, `workflow-typeid-required`, `workflow-typeid-shared-per-union`, `workflow-union-schema-declared`, `workflow-no-unconstructed-variant`, `workflow-no-throw`, `workflow-no-async`, `workflow-single-path`, `workflow-no-ambient-impurity`.

  Kept: `workflow-no-panic-vocabulary`, `workflow-match-exhaustive`, `workflow-no-effect-import` and `workflow-property-test-shape` in `configs.recommended`, plus `workflow-inline-schemas` registered but not recommended.

  Every removal names what refuses the violation instead. Three are refused by `Workflow.make`'s own constructor types, which reject a workflow whose error channel is `never` (`__WORKFLOW_ERROR_CHANNEL_IS_NEVER__`), one whose decision channel is (`__WORKFLOW_DECISION_CHANNEL_IS_NEVER__`), and an error carrying no `_tag` to dispatch on (`__WORKFLOW_ERROR_CHANNEL_CARRIES_NO_TAG__`) — the diagnostic arrives at the construction site, names its own fix, and travels to consumers through the type rather than through an installed lint config. Five more are compiler diagnostics already at `error` in `packages/tsconfig/effect.json`: `asyncFunction` covers `workflow-no-async`, and `globalFetchInEffect`, `globalDateInEffect`, `globalRandomInEffect` and `processEnvInEffect` cover `workflow-no-ambient-impurity`. What survives as a lint rule is what neither mechanism can see: an import edge, an identifier's vocabulary, and one rule over hand-authored test files.

  The remaining removals are deliberately unenforced rather than re-homed. `workflow-no-throw` and the declaration-shape rules asserted properties no type refuses and no diagnostic reports, and each was keyed on a filename, so it never fired on the violation it existed to catch. `docs/2026-08-15-orphaned-cell-constraints.md` records every one with what owning it would take.

  Consumers spreading `configs.recommended` need no change; a config naming a removed rule by key must drop that key.

### Minor Changes

- A new rule, `no-io-module-in-source-test`, reports an in-source test block in a module that performs I/O.

  It decides that a module performs I/O from the module's own syntax: a binding imported from a filesystem, process or network module and then called. A type-only import is ignored, on both the statement and the inline form, because nothing it names survives to run. A binding that is imported but never called is ignored too. The report lands on the in-source test guard.

  The rule reads nothing but the module you give it — not its name, not its directory. A module whose tests live in separate files is a no-op for this rule, whatever it imports, so enabling it changes nothing for a project that keeps tests outside source.

  It is enabled at error severity in the recommended set of both packages, so spreading that set is all it takes.

- An in-source test block that discharges a schema law is no longer required to exercise a
  module-private binding. A law pins a constraint carried by one schema declaration, and
  that declaration is usually exported precisely because it is a wire contract worth
  pinning, so the demand never fitted it. A block earns this by importing the law harness,
  statically or dynamically; nothing else spells it, and blocks that assert on exported
  behaviour are still reported

### Patch Changes

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Updated dependencies:
  - @systemfsoftware/oxlint-plugin-effect-schema@3.0.0
  - @systemfsoftware/oxlint-plugin-effect-workflow@3.0.0
  - @systemfsoftware/oxlint-plugin-test-placement@3.0.0
