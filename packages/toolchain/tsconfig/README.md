# @systemfsoftware/tsconfig

Shared TypeScript base configurations for the System F Software monorepo. One source of truth for compiler options — every package extends a variant and inherits the same target, module resolution, and strictness.

Tuned for 2026 (TypeScript 7 / Node 24): `target: es2024`, `lib: esnext`, and the full modern strictness set on top of `strict` — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`.

> `isolatedDeclarations` is intentionally **off** — it is structurally incompatible with idiomatic Effect (`Schema.Class` extends-clauses and inferred `Layer`/`Metric`/`Schema` value exports have no hand-writable annotation). Don't enable it.

## Usage

Extend the variant that matches the package by transpiler, environment, and shape:

```jsonc
// a bundled (tsdown) library in this monorepo that uses the DOM lib
{ "extends": "@systemfsoftware/tsconfig/bundler/dom/library-monorepo" }
```

Axes:

- **`tsc` vs `bundler`** — module resolution (`NodeNext` emit vs bundler `preserve` + `noEmit`).
- **`dom` vs `no-dom`** — whether the DOM lib is included.
- **`app` / `library` / `library-monorepo`** — emit shape (`declaration`, `composite`, `declarationMap`).

See the `exports` map in `package.json` for the full matrix.

## Effect presets

Two Effect Language Service presets attach a package's Effect policy by role. Both carry the complete plugin block (a rule a role does not carry is omitted, never set `off`), and both list every diagnostic explicitly so nothing inherits an upstream default severity.

- **`@systemfsoftware/tsconfig/effect`** — the library role: shipped `src/` of Effect library packages. Full set, including `strictEffectProvide`: library code never provides a Layer; provision belongs at the entry point.
- **`@systemfsoftware/tsconfig/effect/entrypoint`** — the entry role: test files, runnable examples, and composition packages. Identical to `effect` minus `strictEffectProvide` and `nodeBuiltinImport`, because those files are the composition points where providing a Layer and choosing the runtime's platform are the job (Effect's own platform API needs the Node factory there).

The two diagnostic maps differ by exactly those two rules. Attach the library preset from `tsconfig.app.json`, the entrypoint preset from `tsconfig.test.json` (and composition packages' app projects).

## Project shape

Every package's `tsconfig.json` is a reference-only root (`files: []` plus `references`) over one project per kind of file, so each file is checked under the policy of what it is:

| Project                 | Claims                                      | Extends                                                                        |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| `tsconfig.app.json`     | `src/`, minus in-source test files          | base preset + the role's Effect preset                                         |
| `tsconfig.test.json`    | `tests/`, in-source test files, `examples/` | base preset + `effect/entrypoint` for Effect roles; references the app project |
| `tsconfig.tstyche.json` | `test-types/`                               | base preset + `effect/entrypoint` for Effect roles; references app (and test)  |
| `tsconfig.node.json`    | root tooling and harness files              | `node`                                                                         |

- `typecheck` runs `tsc -b`. A non-build `tsc --noEmit` against the root checks no file and exits 0.
- A referenced project may not disable emit, so the app and test projects set `emitDeclarationOnly` with `outDir` under `node_modules/.cache/tsc/`, never `dist/`; the leaf projects keep `noEmit`.
- A test project cannot reach `src/` through the `@systemfsoftware/source` condition without claiming it, so it references the app project instead.
- `tstyche.json` does not name a `tsconfig`: discovery starts at the root, follows its references, and applies the type-test project's options.
- `tsconfig.build.json` extends `./tsconfig.app.json`; API-report configs extend the base preset directly.
- `scripts/guards/check-project-membership.ts` fails when a tracked TypeScript file belongs to no project or to two; `scripts/guards/check-typecheck-build-mode.ts` fails when a reference-only root is typechecked without `tsc -b`.
