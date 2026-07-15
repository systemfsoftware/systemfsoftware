# U1: Consumer-Reachable TS7-Affected Surface

## Summary

All three consumers are **already safely migrated** to the local `@systemfsoftware/stryker-js-typescript-checker` fork, which uses TS7 unstable APIs (`typescript/unstable/ast`, `typescript/unstable/sync`) instead of root `typescript`. **No consumer loads any package that imports root `typescript`.**

---

## Consumer 1: `packages/effect-daemon-spec`

### Plugins loaded (`stryker.config.json`)

| Plugin                                           | Package Location                                        | Root TS Import? | Details                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| `@stryker-mutator/vitest-runner`                 | pnpm store (`@stryker-mutator+vitest-runner@9.6.1_...`) | **No**          | No `typescript` dependency; imports `@stryker-mutator/api`, `@stryker-mutator/util`, `semver`, `tslib` |
| `@systemfsoftware/stryker-js-typescript-checker` | `packages/stryker-js/typescript-checker/`               | **No**          | Uses only `typescript/unstable/*` subpath imports                                                      |
| `@systemfsoftware/stryker-plugins`               | `packages/stryker-plugins/`                             | **No**          | Babel-based; no TS API usage at all                                                                    |

### Always-loaded (Stryker core)

| Plugin                                              | Root TS Import? |
| --------------------------------------------------- | --------------- |
| `@stryker-mutator/instrumenter` (framework plugins) | **No**          |
| `@stryker-mutator/core` (reporter plugins)          | **No**          |
| `@stryker-mutator/core` (core logic)                | **No**          |
| `@stryker-mutator/api`                              | **No**          |

**TS7-affected packages loaded: NONE**

---

## Consumer 2: `packages/oxlint-plugin`

### Plugins loaded (`stryker.config.json`)

| Plugin                                           | Package Location                          | Root TS Import? | Details                           |
| ------------------------------------------------ | ----------------------------------------- | --------------- | --------------------------------- |
| `@stryker-mutator/vitest-runner`                 | pnpm store                                | **No**          | Same as above                     |
| `@systemfsoftware/stryker-js-typescript-checker` | `packages/stryker-js/typescript-checker/` | **No**          | Uses only `typescript/unstable/*` |

### Always-loaded (Stryker core)

Same as consumer 1 — no root TS imports.

**TS7-affected packages loaded: NONE**

---

## Consumer 3: `packages/stryker-plugins`

### Plugins loaded (`stryker.config.json`)

| Plugin                                           | Package Location                          | Root TS Import? | Details                           |
| ------------------------------------------------ | ----------------------------------------- | --------------- | --------------------------------- |
| `@stryker-mutator/vitest-runner`                 | pnpm store                                | **No**          | Same as above                     |
| `@systemfsoftware/stryker-js-typescript-checker` | `packages/stryker-js/typescript-checker/` | **No**          | Uses only `typescript/unstable/*` |

### Always-loaded (Stryker core)

Same as consumer 1 — no root TS imports.

**TS7-affected packages loaded: NONE**

---

## Local Fork TS7 API Usage (`@systemfsoftware/stryker-js-typescript-checker`)

The compiled `dist/index.mjs` uses these TS7-compatible imports:

| Import path                | Exports used                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `typescript/unstable/ast`  | `SyntaxKind` (imported directly)                                                                   |
| `typescript/unstable/sync` | `API`, `Diagnostic`, `DocumentIdentifier`, `Program`, `Snapshot`, `DiagnosticCategory` (in source) |
| `typescript/unstable/fs`   | `FileSystem` (type-only)                                                                           |

### APIs called (none of which are removed in TS7):

- `new API({ fs })` — TS7 constructor pattern
- `api.updateSnapshot({ openProjects, fileChanges })` — TS7 method
- `snapshot.getProjects()` + `.program` — TS7 program access
- `program.getConfigFileParsingDiagnostics()`, `program.getSemanticDiagnostics()`, `program.getProgramDiagnostics()`
- `program.getSourceFile(fileName as DocumentIdentifier)`
- `sourceFile.statements` (iterating), `sourceFile.referencedFiles`, `sourceFile.typeReferenceDirectives`
- `SyntaxKind.ImportDeclaration`, `SyntaxKind.StringLiteral`, `SyntaxKind.ImportEqualsDeclaration`, `SyntaxKind.ExternalModuleReference` — for AST traversal

**Note:** Source files have unresolved merge conflicts (`ours` = TS7-native, `theirs` = upstream `import ts from 'typescript'`). The compiled `dist/` is from the `ours` branch and is correct. Conflicts need resolution.

---

## Upstream Reference: Not Loaded

### `@stryker-mutator/typescript-checker@9.6.1`

**Installed** in pnpm store (for TS 7.0.2 at `@stryker-mutator+typescript-checker@9.6.1_...__typescript@7.0.2`) but **NOT loaded** by any consumer — none list it in their `plugins` array. Stryker only loads plugins explicitly listed in `config.plugins` (verified in `plugin-loader.js`).

Would be affected if loaded — uses these root `ts.*` APIs:

| File                     | Root TS APIs used                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `tsconfig-helpers.js`    | `ts.version`, `ts.sys.readFile()`, `ts.parseConfigFileTextToJson()`, `ts.ProjectReference`, `ts.resolveProjectReferencePath()` |
| `typescript-checker.js`  | `ts.*` types                                                                                                                   |
| `typescript-compiler.js` | `ts.createSolutionBuilderWithWatchHost()`, `ts.createSolutionBuilderWithWatch()`, `ts.ScriptKind`, `ts.ModuleKind`             |
| `hybrid-file-system.js`  | `ts.*` types                                                                                                                   |
| `script-file.js`         | `ts.*` types                                                                                                                   |

Many of these (`ts.parseConfigFileTextToJson`, `ts.sys`, builder APIs) are **deprecated or have different signatures in TS7**. But since this package is never loaded, it poses no risk.

---

## Conclusion

The consumer-reachable TS7-affected surface is **empty**. All three consumers rely on the local `@systemfsoftware/stryker-js-typescript-checker` which has been fully migrated to TS7's unstable API surface. No additional compatibility shims or checks are needed at the consumer level.
