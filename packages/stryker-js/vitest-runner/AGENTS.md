# AGENTS.md — `@systemfsoftware/stryker-js-vitest-runner`

> **Location:** `packages/stryker-js/vitest-runner/` — Vitest test-runner plugin for Stryker. Universal agent rules live in the root `AGENTS.md`; this file carries only `vitest-runner/`-specific deltas.

A source-code fork of `@stryker-mutator/vitest-runner` v9.6.1 (upstream commit `e1abfbe`). "Upstream" names where it came from, never a limit on changing it. The tsconfig reproduces upstream's own strictness so the vendored source typechecks unmodified; upstream idioms (`@ts-expect-error` across the vitest 4.0/4.1 hook split, non-null assertions on `this.ctx`) are kept deliberately (CONSTITUTION §V.6).

Deltas from root:

- **Lint is baseline oxlint, not the cell config** — `scripts/check-lint-coverage.mjs` records the exemption.
- **No `stryker.config.json`** — this is a shell cell (an adapter over the vitest node API), so it decides nothing and must not be enrolled in mutation (REPO-S5).
- **Browser mode is untested here.** Upstream's `browser-mode.it.spec.ts` and its `browser-project`/`vi-mock` fixtures need `@vitest/browser`, `@vitest/browser-playwright`, `vitest-browser-react`, `react`, `@vitejs/plugin-react` and a downloaded Chromium. The runner's browser support (the `screenshotFailures` suppression in `init()`) is kept verbatim but has no test.

🛑 `src/vitest-test-runner.ts` resolves `./stryker-setup.mjs` next to its own emitted module and copies it into the sandbox, so the integration specs need a fresh `dist/`. `turbo.json` in this package makes `test` depend on its own `build`; a bare `pnpm --filter … test` tests the previous build.

🛑 `src/stryker-setup.ts` must import nothing local — it is copied into the sandbox alone. That is why `collectTestName`/`toRawTestId` are duplicated there instead of imported from `src/test-helpers.ts`.
