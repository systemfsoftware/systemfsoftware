# @systemfsoftware/effect-atom + @systemfsoftware/effect-atom-react

Owned under this org. Ported from [tim-smart/effect-atom](https://github.com/tim-smart/effect-atom) (MIT, "Effect contributors"), via WireBlast's `packages/effect-atom`.

## Delta

- **Not Effect cell code.** These packages keep their own minimal `oxlint.config.ts` and deliberately do **not** extend `@systemfsoftware/oxlint-config`: the cell rules (suffix provenance, workflow purity) are the wrong observer for library code. That is why `packages/effect-atom/atom` and `packages/effect-atom/atom-react` sit under `TOOLING` in `scripts/guards/check-lint-coverage.mjs`.
- **Publishable, built by tsdown alone.** Both ship `dist` (ESM + dts) and carry `attw`, `check:exports`, and `check:publish-config`. `build` is `tsdown && pnpm dts:check`. What ships is tsdown's per-entry dts: a small entry file re-exporting from hashed shared chunks. That indirection is fine — the chunk declares every symbol, and the whole set compiles clean.
- **Do not add api-extractor here.** It was tried and removed. Per-entry `dtsRollup` cannot express this fork's namespace barrel (`export * as Atom from './Atom.js'`, with modules importing their own namespace back from `index.js`): each rollup emits `export declare namespace Registry { export { getResult$1 as getResult, … } }` naming symbols it never inlined, so the shipped types do not compile — measured at **154 errors in `atom`, 51 in `atom-react`** versus **0 for tsdown's output**. `ae-forgotten-export` is api-extractor reporting exactly this, so silencing it to get a green build ships broken declaration files. The house packages (`effect-schema-extensions`, `hex-schema`) use api-extractor safely because their entries export flat symbols, not cross-referencing namespaces — their precedent does not transfer.
- **`dts:check` is the only gate that reads the shipped dts.** Every other gate is blind to declaration-file contents: `typecheck` compiles `src` through the `@systemfsoftware/source` condition and never opens `dist`, `attw` checks resolution rather than type validity, and every tsconfig preset here sets `skipLibCheck: true`. `dts:check` (`tsc --noEmit -p tsconfig.dts.json`) therefore sets `skipLibCheck: false` and `types: ["node"]` to simulate a strict consumer, and it is the check that caught the rollups above. It is load-bearing: a dependency shipping a broken dts can turn it red, and that is the point.
- **oxlint's `import/namespace` resolves the runtime `.mjs`, not the dts.** A type-only export (`export interface Registry`) does not exist there, so `Registry.Registry` through a namespace import warns — even under `import type * as Registry`. Fix it in source with a direct type import (`import { getResult, type Registry } from '…/Registry'`), which is why `atom-react/src/Hooks.ts` deviates from the original's namespace style. Never silence the rule in `oxlint.config.ts`.
- **No mutation gate.** Neither package carries a `stryker.config.json`, and `atom/src/internal/node-lifetime.observer.ts` must never be enrolled in a `mutate` glob: it is an observer of process lifetime, so a surviving mutant there says nothing about test quality.
- **Only `src/` is typechecked** (`include: ["src"]`); `tsconfig.build.json` is what tsdown emits dts from. Test files are compiled by Vitest, not `tsc`.
- **`~effect-atom/atom/…` TypeId literals are wire format,** not module paths. Renaming the packages did not and must not change them: `Hydration` payloads are keyed on those strings.
- **Dependencies flow through the root catalog.** `jsdom` is pinned to the `^29` line on purpose — `jsdom@30` requires node `^24.15.0` and this repo runs 24.14.
- **`atom-react/tsconfig.json` sets `"jsx": "react-jsx"`.** Vite derives its esbuild JSX mode from tsconfig; without it every JSX site in `test/index.test.tsx` fails with `React is not defined`.

## Verification

```bash
pnpm --filter @systemfsoftware/effect-atom build && pnpm --filter @systemfsoftware/effect-atom-react build
pnpm --filter @systemfsoftware/effect-atom typecheck && pnpm --filter @systemfsoftware/effect-atom lint && pnpm --filter @systemfsoftware/effect-atom test && pnpm --filter @systemfsoftware/effect-atom attw
pnpm --filter @systemfsoftware/effect-atom-react typecheck && pnpm --filter @systemfsoftware/effect-atom-react lint && pnpm --filter @systemfsoftware/effect-atom-react test && pnpm --filter @systemfsoftware/effect-atom-react attw
```
