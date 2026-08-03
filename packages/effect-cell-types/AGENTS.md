# AGENTS.md — `@systemfsoftware/effect-cell-types`

> **Delta**: Type-only contract for `*.workflow.ts` cells — `Workflow<Command, Decision, Error>` plus its two `never`-channel markers. Root AGENTS.md governs.

`src/mod.ts` re-exports `src/workflow.kernel.ts`: one type alias and two marker interfaces, nothing else. The package emits no runtime values; consumers write `import type { Workflow } from '@systemfsoftware/effect-cell-types'`. The canonical consumer is `effect-daemon-spec`'s `src/internal/restart-decision.workflow.ts`.

## What makes this package different

```yaml
rules:
  - id: CELL-T1
    title: Type-only — no runtime values, no mutation gate
    do: keep the package free of runtime exports; the contract lives entirely in
      src/workflow.kernel.ts
    dont: add runtime helpers here; add a stryker config or a mutation script
    harm: Stryker mutates behavior and there is no behavior to mutate — a mutation
      gate here would certify nothing. Root REPO-S5 scopes mutate globs to workflow
      cells, which live in consumer packages, not in this type-only one
    check: package.json has no mutation script; src/ declares only types

  - id: CELL-T2
    title: Tests are type-level, not behavioural
    do: assert the contract with expectTypeOf (channel resolution to the function
      type, never-channel resolution to the markers) and @ts-expect-error (a
      function value is not assignable to a marker); the sole @ts-expect-error is
      a regression guard whose unused directive fails the build if the type widens
    dont: add runtime assertions, it.prop, or fast-check — the observable behavior
      of this package IS the type
    harm: a behavioural test can pass while the public type silently widens; a
      type-level test fails exactly when the public contract changes
    check: pnpm --filter @systemfsoftware/effect-cell-types typecheck && test:run

  - id: CELL-T3
    title: The tuple-wrap comment is load-bearing
    do: keep the '[T] extends [never]' note in workflow.kernel.ts verbatim
    dont: delete or reword it during tidy passes
    harm: the comment documents why the check is `[T] extends [never]` and not
      `T extends never` — without the tuple wrap a `never` channel satisfies the
      conditional vacuously and the marker is never reached; a reader
      "simplifying" the type reintroduces the bug
    check: the note survives any edit to workflow.kernel.ts
```

Note on the test file name: `__tests__/workflow.kernel.property.test.ts` contains no
property tests. It is type-level (`expectTypeOf` + one `@ts-expect-error`); the
"property" is the type property tsc checks. Do not rewrite it into fast-check
properties, and do not expect `it.prop` cases there.

## Verification

No mutation gate — see CELL-T1. The contract is verified by:

```bash
pnpm --filter @systemfsoftware/effect-cell-types typecheck
pnpm --filter @systemfsoftware/effect-cell-types test:run
pnpm --filter @systemfsoftware/effect-cell-types lint
pnpm --filter @systemfsoftware/effect-cell-types api:check
```
