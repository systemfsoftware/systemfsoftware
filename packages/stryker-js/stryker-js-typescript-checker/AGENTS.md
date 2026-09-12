# AGENTS.md — `@systemfsoftware/stryker-js-typescript-checker`

The `typescript` Checker plugin for the mutation engine, on the effect-free ABI. The parent `packages/stryker-js/AGENTS.md` governs.

## Rules

- **TC1** — The package declares exactly one contribution, `declarePlugin('Checker', 'typescript', makeChecker)`, and exports it as `strykerPlugins`; no second checker lives here. Gate: `pnpm --filter @systemfsoftware/stryker-js-typescript-checker test`.
- **TC2** — The published surface is effect-free: `src/index.ts` names the ABI's types and the plain `init`/`check`/`group` signatures, and no exported signature mentions `Effect`, `Layer`, `Context`, `Option` or `HashMap`. Gate: `grep -n "effect" src/index.ts` prints no line.
- **TC3** — `typescript` is a peer the host project resolves, never a `dependencies` entry; `@systemfsoftware/stryker-js` is the only dependency. Gate: `pnpm --filter @systemfsoftware/stryker-js-typescript-checker attw`.
- **TC4** — A checker failure rejects the returned promise with the plain `{ _tag: 'CheckerFailed', … }` the ABI's `CheckerFailedSchema` decodes — the same shape `@systemfsoftware/stryker-js-vitest-runner` hands the host — never a bare `throw` of a non-`Error`. Gate: `pnpm --filter @systemfsoftware/stryker-js-typescript-checker test`.
- **TC5** — `src/Mutant.schema.ts` mirrors the ABI's mutant payload and is typed `S.Codec<Mutant>`, so a field the ABI changes fails this package's typecheck until the mirror follows. Gate: `pnpm --filter @systemfsoftware/stryker-js-typescript-checker typecheck`.
- **TC6** — Behaviour lives in one Gherkin feature at `tests/Checker.integration.test.ts` driven through the published entry; the pure decision keeps its properties in `src/__tests__/check-mutants.workflow.property.test.ts`. Gate: `pnpm --filter @systemfsoftware/stryker-js-typescript-checker lint`.

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js-typescript-checker build
pnpm --filter @systemfsoftware/stryker-js-typescript-checker typecheck
pnpm --filter @systemfsoftware/stryker-js-typescript-checker test
pnpm --filter @systemfsoftware/stryker-js-typescript-checker lint
pnpm --filter @systemfsoftware/stryker-js-typescript-checker attw
```
