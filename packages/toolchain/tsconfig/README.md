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
