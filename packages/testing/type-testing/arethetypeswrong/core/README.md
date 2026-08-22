# @systemfsoftware/arethetypeswrong-core

The API behind [arethetypeswrong.github.io](https://arethetypeswrong.github.io).

⚠️ This package is in major version `v0` and the API may change significantly in patch and minor releases. Use at your own risk. Documentation will not be provided at least until the package reaches version `v1`.

## TypeScript version pin

The runtime dependency `typescript` runs on the **6.x JS bridge** (`catalog:attw`, `^6.0.3`) — the last TypeScript line with the full JS compiler API — while the rest of the monorepo runs `typescript@7` (native Go compiler, `catalog:`).

`typescript@7` exports **no JS compiler API**: the package main entry is `./lib/version.cjs` (version strings only), and the `unstable/*` exports are an LSP-style snapshot client (`API`/`Snapshot`/`Project`/`Program`/`Checker`) with no `createProgram`, no `resolveModuleName`, no `CompilerHost`, no module-resolution caches, and no resolution traces. The analysis engine in `src/internal/multiCompilerHost.ts` (and `getEntrypointInfo.ts`) is built on exactly those internals; the small internal surface it needs (`bindSourceFile`, `SourceFile.symbol`/`locals`, package-scope helpers, etc.) is declared locally in `TsInternals.d.ts` and `TsCompat.ts` — the previous augmentation package (which topped out at 5.6.3) is no longer used. A tsgo-API rewrite would require reimplementing TypeScript's module resolution and would change analysis fidelity — the checks this package …

`typescript@6` (the bridge release) keeps the full compiler API, so this package is as close to TypeScript 7 as its architecture allows. Two snapshot fixtures (`moment@2.29.1`, `react@18.2.0`) embed the compiler version in resolution traces and were regenerated when moving 5.9.3 → 6.0.3.

The original `arethetypeswrong` pins `typescript@5.6.1-rc` for the same fidelity reason.

Dependabot is configured to never propose a `typescript` major bump for this repo (see `.github/dependabot.yml`); majors are manual, deliberate migrations. The durable record of this decision lives in `docs/solutions/tooling-decisions/arethetypeswrong-core-requires-js-typescript-api.md`.
