# AGENTS.md — `@systemfsoftware/stryker-js-vitest-runner`

> **Location:** `packages/stryker-js/vitest-runner/` — Vitest test-runner plugin for Stryker.

A source-code fork of `@stryker-mutator/vitest-runner` v9.6.1 (upstream commit `e1abfbe`). The tsconfig reproduces upstream's own strictness so the vendored source typechecks unmodified; upstream idioms (`@ts-expect-error` across the vitest 4.0/4.1 hook split, non-null assertions on `this.ctx`) are kept deliberately (CONSTITUTION §V.6).

Deltas from root:

- **No `stryker.config.json`** — this is a shell cell (an adapter over the vitest node API), so it decides nothing and must not be enrolled in mutation (root mutation rule — `check:mutate-scope`).
- **Browser mode is untested here.** Upstream's `browser-mode.it.spec.ts` and its `browser-project`/`vi-mock` fixtures need `@vitest/browser`, `@vitest/browser-playwright`, `vitest-browser-react`, `react`, `@vitejs/plugin-react` and a downloaded Chromium. The runner's browser support (the `screenshotFailures` suppression in `init()`) is kept verbatim but has no test.
- **What diverges from upstream, for a future merge.** `src/` carries exactly four edits — `./stryker-setup.js` → `./stryker-setup.mjs` in `vitest-test-runner.ts`, `VitestTestRunner` injecting `commonTokens.sandboxDirectory` (forked plugin API) as the project root instead of reading `process.cwd()` — the root is passed to Vitest as `root`, the setup file and the project's Vitest are resolved against it, and `options.vitest.dir` reaches Vitest only as the `dir` scan filter resolved against that root — a hand-written `vitest-runner-options-with-stryker-options.ts` replacing upstream's generated `src-generated/` import, and an `index.ts` rewritten around the local schema path. `schema/vitest-runner-options.json` differs in its `dir` `description` string. Everything under `test/` is a port, not a mirror: vitest + `vi` where upstream is mocha/chai/sinon, and `test/util/factories.ts` fills Stryker defaults with ajv against `strykerCoreSchema` instead of importing `@stryker-mutator/test-helpers`.

🛑 `src/vitest-test-runner.ts` resolves `stryker-setup.mjs` next to its own emitted module and copies it into the sandbox, so the integration specs need a fresh `dist/`. `turbo.json` in this package makes `test` depend on its own `build`, so run `pnpm turbo test --filter=@systemfsoftware/stryker-js-vitest-runner`; a bare `pnpm --filter … test` tests the previous build.

🛑 `src/stryker-setup.ts` must import nothing local — it is copied into the sandbox alone. That is why `collectTestName`/`toRawTestId` are duplicated there instead of imported from `src/test-helpers.ts`.
