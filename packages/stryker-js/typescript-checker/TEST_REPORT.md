# Test Report — `@systemfsoftware/stryker-js-typescript-checker`

## Verification gates

All gates were run from the monorepo root and exited 0:

```text
pnpm --filter @systemfsoftware/stryker-js-typescript-checker typecheck   # 0 errors
pnpm --filter @systemfsoftware/stryker-js-typescript-checker build       # dist/index.mjs + dist/index.d.mts
pnpm --filter @systemfsoftware/stryker-js-typescript-checker test        # 53 tests across 8 files
pnpm --filter @systemfsoftware/stryker-js-typescript-checker lint        # 0 errors
```

## Architecture

- TypeScript 7 native API only: `typescript/unstable/sync` (`API`, `Snapshot`, `Project`, `Program`, `Diagnostic`), `typescript/unstable/ast` (`SyntaxKind`, `SourceFile`), and `typescript/unstable/fs` (`FileSystem`).
- No imports from root `typescript` for compiler APIs.
- Custom `HybridFileSystem` implements the TS7 `FileSystem` interface, tracks mutations in memory, and falls back to disk for files it does not own.
- `TypescriptCompiler` parses tsconfigs (with comment stripping), opens projects, runs diagnostics, builds the dependency graph from `program.getSourceFileNames()` and top-level import declarations, and applies/reset mutants via snapshots.
- `TypescriptChecker` maps diagnostics back to mutants using the bidirectional dependency graph and supports grouping.

## Test coverage

### Unit tests

- `test/unit/fs/hybrid-file-system.spec.ts` — read/write/mutate/reset, path normalization, buildinfo handling, tsconfig overrides.
- `test/unit/grouping/create-groups.spec.ts` — grouping with isolated files, parent/child references, circular references, same-file mutants, missing-node error.
- `test/unit/grouping/ts-file-node.spec.ts` — parent/child traversal, cyclic graph safety, mutant association, path-separator handling.

### Integration tests (upstream fixtures)

- `test/integration/single-project.it.spec.ts` — dry-run, passing mutants, compile errors in same and dependent files, resetting mutations between checks, unrelated JS files, option overrides (unused locals).
- `test/integration/project-references.it.spec.ts` — referenced projects, declaration emit, grouping across project boundaries.
- `test/integration/project-with-ts-buildinfo.it.spec.ts` — projects with existing `.tsbuildinfo` files.
- `test/integration/typescript-checkers-errors.it.spec.ts` — dry-run failure on pre-existing compile errors, invalid tsconfig, missing tsconfig file.
- `test/integration/e2e-plugin-entry.it.spec.ts` — end-to-end exercise of the public plugin factory `createTypescriptChecker` through a minimal typed-inject-compatible injector against the upstream `single-project` fixture; verifies `Passed` and `CompileError` results.

## Known deviations / gaps

1. **TS7 legacy option removal**: The upstream fixtures use `target: ES5` and `moduleResolution: node`, which TypeScript 7 has removed. The checker overrides these to `es2022` / `bundler` via `overrideOptions` so the fixtures can still be type-checked. This changes the compilation target but preserves the type-checking semantics needed by the tests.
2. **Diagnostic formatting**: Formatting is implemented manually (`file(line,col): severity TScode: message`) because TS7 no longer exposes `ts.formatDiagnostics`. Messages match the upstream assertions.
3. **Dependency graph**: Built by walking top-level `ImportDeclaration` / `ImportEqualsDeclaration` statements and triple-slash references, then resolving relative specifiers to source files. This is sufficient for the upstream grouping fixtures; module resolution for bare specifiers (e.g. `node_modules`) is ignored, matching upstream behavior.
4. **Source maps for `.d.ts` references**: The compiler can map emitted declaration files back to source files via source maps, but the current test suite does not exercise a case where this is required.
5. **Full Stryker CLI run**: The package-level test suite exercises the public plugin factory and the `Checker` interface; a full Stryker CLI run is out of scope for this package-level test suite.

## Result

The package builds, type-checks, lints, and passes its test suite. It can be dropped into a Stryker configuration as the `typescript` checker plugin.
