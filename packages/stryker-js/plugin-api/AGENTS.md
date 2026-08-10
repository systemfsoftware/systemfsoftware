# AGENTS.md — `@systemfsoftware/stryker-js-plugin-api`

> **Location:** `packages/stryker-js/plugin-api/` — the plugin API of the @systemfsoftware Stryker fork. Universal agent rules live in the root `AGENTS.md`; this file carries only `plugin-api/`-specific deltas.

A source-code fork of `@stryker-mutator/api` v9.6.1. "Upstream" names where it came from, never a limit on changing it. The tsconfig reproduces upstream's own strictness so the vendored source typechecks unmodified; upstream idioms are kept deliberately (CONSTITUTION §V.6).

Deltas from root:

- **Lint is baseline oxlint, not the cell config** — `scripts/check-lint-coverage.mjs` records the exemption.
- **No `stryker.config.json`** — this is an API/types cell, so it decides nothing and must not be enrolled in mutation (REPO-S5).
- **The one intentional divergence from upstream, for a future merge.** `src/` carries exactly two edited files: `src/plugin/tokens.ts` gains `commonTokens.sandboxDirectory`, and `src/plugin/contexts.ts` gains the exported `SandboxPluginContext` interface (a `PluginContext` with `[commonTokens.sandboxDirectory]: string`). They exist so Stryker can hand the sandbox directory to plugins as an injected value instead of plugins inferring it from `process.cwd()`. The token is bound only in sandbox worker processes (test runners, checkers); plugins that run in the main process, such as reporters, must not inject it — core cannot supply it there.
- **`src-generated/stryker-core.ts` is generated and committed.** Upstream generates it from `schema/stryker-core.json` (`tasks/generate-json-schema-to-ts.js`, run before every build) and gitignores it; this fork commits it so `tsdown` and `tsc` work from a clean checkout. Regenerate with `pnpm generate` (this package) after touching the schema — the generator is a port of upstream's, pinned to the same `json-schema-to-typescript@15.0.4`.
- **`core.d.ts` is deleted.** Upstream ships it as a shim so `--moduleResolution node` can resolve `@stryker-mutator/api/core` for JSDoc `import('.../core')` type annotations. This fork is ESM-only with a tsdown-generated exports map, so the `./core` subpath resolves through `exports`, and the shim's `./dist/src/core/index.js` target is a layout the tsdown build no longer produces.
- **Build layout is `dist/<subpath>/index.mjs`, not `dist/<subpath>.mjs`.** The vendored `src/core/stryker-options-schema.ts` reads `../../schema/stryker-core.json` relative to its emitted module at runtime; nesting each entry two levels below the package root keeps that read landing on `schema/` at the package root — the same convention the sibling forks use (`../schema/` from a flat `dist/` entry). Do not flatten the entries without moving the schema, or the `core` subpath breaks at runtime.
