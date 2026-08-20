## 2.0.0

### Major Changes

- Collapse projection tags into the ports they projected

  A `*ExecutorDeps` tag whose service type was indexed off other ports recorded which members
  one operation happened to reach for. Exporting it turned internal composition into a surface
  commitment: a consumer had to discover and provide an aggregator for each operation, where the
  port it came from already served. The tags rode the `R` channel of exported signatures, so a
  consumer met them only at their own call site.

  Each was removed the way its evidence directed — no tag was renamed, and none was replaced:

  - `AttwCliExecutorDeps`, `CheckPackageExecutorDeps` — deleted. Zero consumers, no Live layer;
    callers already required the real capabilities directly.
  - `HookDispatcherExecutorDeps` — was a 1:1 alias of `Scope.Scope`. Requiring `Scope` names the
    same service.
  - `InjectInstructionsExecutorDeps` — packed `FileSystem`, `Path` and `TomlLoader` with no logic.
    Consumers require the three ports.
  - `EffectVitestDeps` → `EffectVitestBindings`. Never a `Context.Tag`: a plain type alias already
    passed as an ordinary parameter, so only the name misdescribed it. A stale api report that no
    `api-extractor` regenerates was deleted with it.

  A consumer providing a port instead of an aggregator provides no more than before, since a
  service `{ a, b }` is assignable to a requirement `{ a }`.

### Minor Changes

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- An `.attw.json` in the working directory is read again. Rules listed under `ignoreRules`
  were being discarded, so a package that had waived a resolution condition still failed on
  it, and the only way to get a passing run was to repeat every rule on the command line

- Rename five mislabelled `*.workflow.ts` files to `*.kernel.ts`.

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

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Build the `bin` target during install. Both CLIs point `bin` at gitignored build output, which pnpm's two bin-link passes skip when it is absent, leaving a fresh clone without the command and never retrying. A `prepare` script now builds the target between the passes; `arethetypeswrong-cli` drops its committed `bin/attw.mjs` launcher in favour of the same pattern.

- Updated dependencies:
  - @systemfsoftware/arethetypeswrong-core@2.0.0
