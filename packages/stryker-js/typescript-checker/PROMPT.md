# Long-horizon task brief: build `@systemfsoftware/stryker-js-typescript-checker`

## DEFINITIONS

- **Old package**: `@stryker-mutator/typescript-checker` v9.6.1 in the upstream stryker-js monorepo, located in this session at `/tmp/upstream/stryker-js/packages/typescript-checker/`. Its source, tests and test resources are the behavioral reference.
- **New package**: `@systemfsoftware/stryker-js-typescript-checker`, a fresh package in `packages/stryker-js/typescript-checker/` of this monorepo.
- **TS7 native API**: the API exported by `typescript/unstable/sync` (and, for AST/dep-graph helpers, `typescript/unstable/ast`) from the npm package `typescript@^7` (currently `7.0.2`). Key symbols: `API`, `Snapshot`, `Project`, `Program`, `Checker`, `Diagnostic`, `FileSystem`. It is LSP-based and replaces the old function-based API (`ts.sys`, `ts.createSolutionBuilderWithWatchHost`, `ts.Diagnostic`, `ts.SourceFile`, etc.).
- **Monorepo tooling**: `pnpm` workspace, `tsdown` (^0.22.7) for build, `vitest` for tests, `oxlint` for lint, `@systemfsoftware/tsconfig` for type-checking, `@systemfsoftware/vitest-config` for test config.
- **Feature parity**: the new package passes the same test scenarios that the old package's test suite covers, and can be dropped into a Stryker run in place of the old plugin.

## TASK

Build the new package from scratch so that:

1. It exports a Stryker `Checker` plugin named `typescript` via `declareFactoryPlugin(PluginKind.Checker, 'typescript', create)`.
2. Its `TypescriptChecker` class implements `Checker` from `@stryker-mutator/api/check` with methods `init()`, `check(mutants)`, and `group(mutants)`.
3. It uses only the TS7 native API (`typescript/unstable/sync`, `typescript/unstable/ast` for dependency-graph extraction and line/column formatting, and `typescript/unstable/fs` if needed); no import from the root `typescript` module for compiler APIs, no `ts.sys`, no `ts.createSolutionBuilderWithWatchHost`, no `ts.SourceFile`, no `ts.FileWatcherCallback`.
4. It implements an in-memory/hybrid file system by implementing the TS7 `FileSystem` interface, reading from disk and keeping writes and mutations in memory.
5. It parses `tsconfig.json` (and project references), runs a dry-run type-check on `init()`, and reports compile errors caused by mutants on `check()`.
6. It groups mutants for efficient checking. The grouping strategy must correctly handle dependency graphs: mutants in files whose dependency influence zones overlap cannot be safely checked together without producing ambiguous error attribution.
7. It formats diagnostics into human-readable error messages.
8. It builds with `pnpm build` (tsdown), type-checks with `pnpm typecheck` (tsc), lints with `pnpm lint` (oxlint), and passes tests with `pnpm test` (vitest).
9. The package is wired into the monorepo workspace (`pnpm-workspace.yaml`) and uses `typescript: catalog:` for its `typescript` dependency.
10. Before writing tests, copy the upstream test resources into the package: `cp -R /tmp/upstream/stryker-js/packages/typescript-checker/testResources packages/stryker-js/typescript-checker/testResources/`.

## DOES NOT COUNT

- A package that compiles but does not run as a Stryker checker.
- A checker that always passes or always fails every mutant regardless of actual type errors.
- A checker that works only for single-project `tsconfig.json` and ignores project references.
- A checker that checks every mutant individually (no grouping), because that loses the performance feature of the old package.
- A checker that groups mutants without respecting import/dependency edges, producing false positives or ambiguous blame.
- A checker that uses the old `typescript` default import API, a compat package (`@typescript/typescript6`), or any non-TS7-native shim.
- A package that copies the old source and renames imports without redesigning the architecture for the TS7 `API`/`Snapshot` model.
- A package whose tests are ports of the old mocha/chai/sinon suite without also adding new tests that exercise the TS7-native API surface.
- A design document, plan, or partial implementation that does not pass the Definition of Done gates.

## ORCHESTRATION

This is a single-package implementation task. Use parallel subagents only for independent research and review, not for splitting the implementation itself:

- Worker A: study the upstream package (`/tmp/upstream/stryker-js/packages/typescript-checker/`) and produce a concise behavioral spec (what `init`, `check`, `group` must do; what edge cases the tests cover).
- Worker B: study the TS7 native API (`typescript/unstable/sync`, `typescript/unstable/fs`) and produce a usage recipe for the core loop: create `API` with `FileSystem`, open project, get diagnostics, update snapshot after file changes.
- Main worker: implement the package, then run the verification gates below.
- Review worker: after the main worker claims completion, independently verify the Definition of Done gates and report gaps.

Do not let early workers dictate architecture; use their findings, but the main worker designs for TS7-native idioms.

## VERIFICATION

An adversarial reviewer must confirm every item below before the task is considered complete:

1. `pnpm --filter @systemfsoftware/stryker-js-typescript-checker typecheck` exits 0 with no `any` and no `@ts-ignore`/`@ts-expect-error`.
2. `pnpm --filter @systemfsoftware/stryker-js-typescript-checker build` exits 0 and produces `dist/index.mjs` and `dist/index.d.mts`.
3. `pnpm --filter @systemfsoftware/stryker-js-typescript-checker test` exits 0. Tests include:
   - unit tests for the file system (read/write/mutate/reset)
   - unit tests for grouping logic with dependency overlap
   - integration tests on the test resources from the upstream package (`testResources/single-project`, `testResources/project-references`, `testResources/project-with-ts-buildinfo`, `testResources/errors`):
     - dry-run succeeds when no type errors exist
     - dry-run fails when type errors exist
     - a mutant that introduces a type error is reported as `CompileError`
     - a mutant that does not introduce a type error is reported as `Passed`
     - mutants in unrelated files are grouped together
     - mutants in files with shared dependencies are not grouped together in a way that causes false blame
4. `pnpm --filter @systemfsoftware/stryker-js-typescript-checker lint` exits 0.
5. No import from `typescript` default export or root `typescript` for compiler APIs; all compiler interaction goes through `typescript/unstable/sync` (with `typescript/unstable/ast` allowed for dep-graph and formatting helpers).
6. No committed `dist/` or build artifacts; build output is gitignored.
7. The package does not depend on `@stryker-mutator/test-helpers`, `@stryker-mutator/core`, or `@stryker-mutator/instrumenter`.
8. An end-to-end Stryker integration test runs the checker through its public plugin entry against at least one upstream fixture and reports `Passed`/`CompileError` correctly.

## REPORTING CONTRACT

Return concrete artifacts only:

- The final package source tree under `packages/stryker-js/typescript-checker/`.
- A `TEST_REPORT.md` in that directory summarizing which upstream scenarios are covered and any known gaps.
- The exact command outputs for `typecheck`, `build`, `test`, and `lint`.

Status-only reports ("almost done", "working on it") are rejected.

## RETURN CONDITION

Return only when all verification items pass. If a reviewer finds a gap, fix it and re-run the full verification list. Do not return a partial implementation, a plan, or an explanation of difficulty.

## EFFORT

Assume a clean TS7-native implementation is achievable. Spend at least one focused implementation pass before considering return. If the TS7 API lacks an old capability (e.g., a direct replacement for `ts.createSolutionBuilderWithWatchHost`), redesign around the `API`/`Snapshot` model rather than forcing the old shape.

## CONTAMINATION

External web search is allowed only for TS7 API documentation and examples. Do not copy implementation code from external sources; the upstream stryker-js package in `/tmp/upstream/` is the only allowed reference for behavioral parity.

## CONTEXT

- Monorepo root: `/mnt/projects/God/systemfsoftware`
- Upstream reference: `/tmp/upstream/stryker-js/packages/typescript-checker/`
- TS7 subtree (reference only, not a workspace dependency): `repos/typescript-go/`
- Package target: `packages/stryker-js/typescript-checker/`
- Workspace entry already added to `pnpm-workspace.yaml`: `"packages/stryker-js/*"`
- `typescript` catalog already set to `^7` in `pnpm-workspace.yaml`.
- Consumer packages (`stryker-plugins`, `oxlint-plugin`, `effect-daemon-spec`) remain on upstream `@stryker-mutator/*` from npm and are out of scope.

## DEFINITION OF DONE

All of: typecheck 0, build 0, lint 0, test 0, no old TS API imports, integration tests on upstream test resources pass.
