# AGENTS.md — `@systemfsoftware/stryker-js-vitest-runner`

> **Location:** `packages/stryker-js/vitest-runner/` — Vitest test-runner plugin for Stryker.

Ported from `@stryker-mutator/vitest-runner` v9.6.1 (commit `e1abfbe`). The tsconfig reproduces the original's strictness so the ported source typechecks unmodified; its idioms (`@ts-expect-error` across the vitest 4.0/4.1 hook split, non-null assertions on `this.ctx`) are kept deliberately (CONSTITUTION §V.6).

Deltas from root:

- **No `stryker.config.json`** — this is a shell cell (an adapter over the vitest node API), so it decides nothing and must not be enrolled in mutation (root mutation rule — `check:mutate-scope`).
- **Browser mode is untested here.** The original's `browser-mode.it.spec.ts` and its `browser-project`/`vi-mock` fixtures need `@vitest/browser`, `@vitest/browser-playwright`, `vitest-browser-react`, `react`, `@vitejs/plugin-react` and a downloaded Chromium. The runner's browser support (the `screenshotFailures` suppression in `init()`) is kept verbatim but has no test.
- **What diverges from the original.** `src/` carries exactly four edits — `./stryker-setup.js` → `./stryker-setup.mjs` in `vitest-test-runner.ts`, `VitestTestRunner` injecting `commonTokens.sandboxDirectory` (forked plugin API) as the project root instead of reading `process.cwd()` — the root is passed to Vitest as `root`, the setup file and the project's Vitest are resolved against it, and `options.vitest.dir` reaches Vitest only as the `dir` scan filter resolved against that root — a `vitest-runner-options.schema.ts` Effect-Schema declaration for the `vitest` option section (replacing the original's generated `src-generated/` import), and an `index.ts` rewritten around the local schema paths — including `strykerValidationSchema`, which is the JSON Schema document **derived** from that declaration (no `schema/` file). Everything under `tests/` is a port, not a mirror: vitest + `vi` where the original is mocha/chai/sinon, and `tests/__fixtures__/factories.ts` fills Stryker defaults by decoding `{}` against `StrykerOptionsSchema` from `@systemfsoftware/stryker-js-plugin-api/core` instead of importing `@stryker-mutator/test-helpers`.

🛑 `src/vitest-test-runner.ts` resolves `stryker-setup.mjs` next to its own emitted module and copies it into the sandbox, so the integration specs need a fresh `dist/`. `turbo.json` in this package makes `test` depend on its own `build`, so run `pnpm turbo test --filter=@systemfsoftware/stryker-js-vitest-runner`; a bare `pnpm --filter … test` tests the previous build.

🛑 `src/stryker-setup.ts` must import nothing local — it is copied into the sandbox alone. That is why `collectTestName`/`toRawTestId` are duplicated there instead of imported from `src/test-helpers.ts`.
