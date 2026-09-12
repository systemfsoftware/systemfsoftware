# AGENTS.md — `@systemfsoftware/stryker-js-vitest-runner`

Vitest test-runner plugin for Stryker, on the effect-free ABI. Parent: `packages/stryker-js/AGENTS.md`.

## Rules

- **VR1** — This package declares exactly one contribution, `declarePlugin('TestRunner', 'vitest', makeTestRunner)`, and `strykerPlugins` carries it; a config selects the runner by the name `vitest`. Gate: `pnpm --filter @systemfsoftware/stryker-js-vitest-runner test`.
- **VR2** — The published surface stays effect-free: `makeTestRunner` returns the plain `{ init?, dispose?, capabilities?, dryRun?, mutantRun? }` object, and no exported type names `Effect`, `Layer` or `Context`. Gate: `pnpm --filter @systemfsoftware/stryker-js-vitest-runner typecheck`.
- **VR3** — A failed call rejects with the plain `TestRunnerFailed` object (`_tag`, `cause`, `phase`, `runnerName`); the host decodes it with the ABI's schema. Gate: `review`.
- **VR4** — The project a run mutates is the process directory: vitest resolves from there and the setup file is copied there. Gate: `review`.
- **VR5** — `vitest` stays a peer resolved from the project's own install; the runner never falls back to an install of its own. Gate: `review`.
- **VR6** — `src/stryker-setup.ts` imports nothing local. Gate: `grep -n "^import" src/stryker-setup.ts` shows no relative imports.
- **VR7** — Behaviour specs are one Gherkin feature in `tests/*.integration.test.ts` driving the published entry; the pure interpretation decision keeps its property test in `src/__tests__/`. Gate: `pnpm --filter @systemfsoftware/stryker-js-vitest-runner test`.
- **VR8** — Source carries no type-suppression comments and no non-null assertions. Gate: `pnpm --filter @systemfsoftware/stryker-js-vitest-runner lint`.

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js-vitest-runner build
pnpm --filter @systemfsoftware/stryker-js-vitest-runner typecheck
pnpm --filter @systemfsoftware/stryker-js-vitest-runner test
pnpm --filter @systemfsoftware/stryker-js-vitest-runner lint
pnpm --filter @systemfsoftware/stryker-js-vitest-runner attw
```
