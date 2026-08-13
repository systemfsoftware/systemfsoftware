---
"@systemfsoftware/arethetypeswrong-cli": patch
"@systemfsoftware/arethetypeswrong-core": patch
---

Rename five mislabelled `*.workflow.ts` files to `*.kernel.ts`.

`computeExitCode`, `applyProfile`, `renderAnalysis`, `detectEntrypointResolutions`, and
`detectModuleKindDisagreement` each return a bare value — a decision instance, a string, an array, or
`undefined` — never an `Either`. None has a failure mode, so none is a workflow, and the suffix was
claiming a contract the files never held. The `UninhabitedError` marker in
`@systemfsoftware/effect-cell-types` prescribes exactly this repair: "this workflow cannot fail, so it
decides nothing; give it an error variant or move it to a `*.kernel.ts`". Wrapping their results in
`Either.right` to satisfy the constructor was rejected — that manufactures a success-only decision.

Neither package takes a dependency on the constructor. Both are listed as `TOOLING` in
`scripts/guards/check-lint-coverage.mjs` ("port of arethetypeswrong, tooling"), carry no
`oxlint.config.ts`, and the cell rules deliberately do not reach them.

The public symbols and the `export *` surface of `core/src/index.ts` are unchanged, so no consumer
import breaks. The bump is real rather than empty because both packages ship `dist/` built from these
sources: the emitted chunk filenames change, and `arethetypeswrong-cli` rebuilds its `bin` target at
pack time via `prepack`. Test files and one non-UTF-8 property test were repointed alongside.
