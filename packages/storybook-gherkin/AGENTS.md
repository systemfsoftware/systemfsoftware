# @systemfsoftware/storybook-gherkin — Feature Specs → Stories

Vendored from WireBlast's `packages/storybook-gherkin` at its `HEAD`, extracted and rescoped under this org. Root `AGENTS.md` governs, with the deltas below.

Binds Gherkin specifications to Storybook 10 CSF-factory stories: specs declared with this DSL in a `.stories.tsx` read like a `.feature` file and execute as play functions under the real browser runner.

## Delta

- **Not Effect cell code.** This package keeps its own minimal `oxlint.config.ts` and deliberately does **not** extend `@systemfsoftware/oxlint-config`: the cell rules (suffix provenance, workflow purity) are the wrong observer for upstream-shaped library code. `scripts/check-lint-coverage.mjs` lists `packages/storybook-gherkin/` under `TOOLING` for exactly that reason — that entry is about which lint baseline applies, not about whether the package publishes.
- **Publishable, built by tsdown alone.** Ships `dist` (ESM + dts) and carries `attw`, `check:exports`, and `check:publish-config`. `build` is `tsdown && pnpm dts:check`.
- **Do not add api-extractor here.** The entry is a flat re-export barrel over the observers; tsdown's per-entry dts is the shipped types. `dts:check` (`node scripts/check-dts.mjs`, driving `tsc --noEmit -p tsconfig.dts.json`) is the only gate that reads the shipped dts — it sets `skipLibCheck: false` to simulate a strict consumer, and it is load-bearing.
- **`dts:check` is scoped to OUR dist.** The strict check drags third-party declaration files into the program: the `storybook/test` type surface flows through `@vitest/expect`, whose declarations reference an ambient `Chai` namespace they never declare (their own `@types/chai` dependency is installed but not ambient-visible, so `types: ["node"]` fails with TS2503). Adding a `@types/chai` devDependency we do not use would be cope; instead `scripts/check-dts.mjs` fails only on diagnostics whose file is under `dist/` (or is otherwise unattributable — a tsc crash or config error still fails), and treats errors in `node_modules` as third-party noise by construction. Our own dts is checked exactly as strictly as before; the manifest stays honest.
- **`dts:check` sets `composite: false`.** The base preset enables composite, whose incremental `tsbuildinfo` replayed a stale program and masked a config change (measured: deleting the buildinfo flipped the same config from red to green). The dts project is standalone — nothing references it — so composite buys nothing and costs determinism.
- **M1 This package is a test library — it ships NO test suite.** The test is that specs written with this DSL compile, import, and run green under the consumer's real Storybook browser-mode runner. NEVER add vitest/stryker configs or unit tests here; there is no `test` script by design, and root Global Forbidden Patterns bans simulated DOM outright, so no node-side DOM test can exist anyway.
- **M2 Breaking changes are encouraged.** Root release policy applies in full: delete old API paths outright, migrate every caller in the same change, NEVER keep compat shims or deprecated aliases.
- **M4 The embedded spec is the ONLY representation.** A story using this DSL IS the `.feature` — NEVER produce or require a parallel `.feature` file for a storied app; duplicate representations drift.
- **No mutation gate.** No `stryker.config.json`; the package must never be enrolled in a `mutate` glob (REPO-S5).
- **`storybook` is a peerDependency** (`>=10.0.0`) even though `storybook/test` is imported at runtime (`screen`, `within`) — the consumer's Storybook install provides it. `effect` is a peer, matching the org's effect packaging. `type-fest` is a regular dependency: its types appear in the shipped dts (`CapsOf` via `Simplify`/`UnionToIntersection`), so consumers need it resolvable.
- **Dependencies flow through the root catalog.** `storybook: ^10.5.0` and `type-fest: ^5.8.0` match the versions WireBlast's catalog resolved; neither needs WireBlast's `patches/storybook@10.5.0.patch` (that patch edits runtime JS chunks only, and this package never runs storybook — it only typechecks against it).
- **Only `src/` is typechecked** (`include: ["src"]`); `tsconfig.build.json` is what tsdown emits dts from.

## Verification

```bash
pnpm --filter @systemfsoftware/storybook-gherkin build
pnpm --filter @systemfsoftware/storybook-gherkin typecheck && pnpm --filter @systemfsoftware/storybook-gherkin lint && pnpm --filter @systemfsoftware/storybook-gherkin attw
```

There is no `test` script (M1).
