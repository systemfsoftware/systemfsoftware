# @systemfsoftware/arethetypeswrong-cli + @systemfsoftware/arethetypeswrong-core

Fork of the upstream arethetypeswrong tooling (the checker behind arethetypeswrong.github.io), republished under this org, governing `packages/arethetypeswrong/cli` and `packages/arethetypeswrong/core`. Root `AGENTS.md` governs; the deltas below.

## Delta

- **These are the only two packages in the workspace with a `prepack` script.** Both carry `"prepack": "pnpm build"`; no other `package.json` under `packages/` or `omp/` does. Every other publishable package relies on `pnpm turbo build` having produced `dist` before publish. Here `dist` is untracked build output — a fresh checkout has none — so `prepack` rebuilds it at pack time. NEVER delete these `prepack` scripts: without them, `pnpm publish` packs an empty or stale `dist` and the published artifact is broken.
- **The CLI's `bin` points at gitignored build output, so `prepare` must build it.** `bin.attw` is `dist/main.mjs`, which no fresh checkout has. pnpm links `.bin` shims twice per install, once before lifecycle scripts and once after, and silently skips a shim whose target is missing in both passes — with no later install, not even `--force`, ever revisiting a package it considers linked. `"prepare": "tsdown"` builds the target in the gap between the two passes. NEVER delete it, and never repoint `bin` at a committed shim to dodge the ordering: the committed shim this package used to carry was removed in favour of the `prepare` pattern the stryker CLI uses (`docs/solutions/build-errors/pnpm-bin-shim-skipped-for-gitignored-build-target.md`).
- **Forked compiler-driven tooling, not Effect cell code.** `scripts/check-lint-coverage.mjs` lists `packages/arethetypeswrong/cli` and `packages/arethetypeswrong/core` under `TOOLING` ("port of arethetypeswrong, tooling"), so the cell oxlint rules do not apply here. Neither package carries an `oxlint.config.ts`, and neither has a `lint` script.
- **No mutation gate.** Neither package has a `stryker.config.json`; do not add one by reflex.
- **The core pins its own TypeScript line.** `core/package.json` resolves `typescript` through the `attw` catalog entry (`typescript: ^6.0.3` in `pnpm-workspace.yaml`), not the default catalog. The fork drives the JS compiler bridge — `ts-expose-internals` is a devDependency — and typescript@7 is a native Go compiler with no JS API (`docs/solutions/tooling-decisions/arethetypeswrong-core-requires-js-typescript-api.md`). Never move it to the default catalog without confirming the core still compiles against the bridge.

## Verification

Both packages share the same script block (`build`, `typecheck`, `test`, `test:run`); run per package:

- `pnpm --filter @systemfsoftware/arethetypeswrong-cli build && pnpm --filter @systemfsoftware/arethetypeswrong-cli typecheck && pnpm --filter @systemfsoftware/arethetypeswrong-cli test`
- `pnpm --filter @systemfsoftware/arethetypeswrong-core build && pnpm --filter @systemfsoftware/arethetypeswrong-core typecheck && pnpm --filter @systemfsoftware/arethetypeswrong-core test`
- Coverage variant: `pnpm --filter @systemfsoftware/arethetypeswrong-<pkg> test:run`
