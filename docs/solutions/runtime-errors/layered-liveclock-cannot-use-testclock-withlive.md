---
title: "Layered liveClock cannot use TestClock.withLive on effect v4; exclude TestEnv instead"
date: 2026-08-13
category: runtime-errors
module: effect-gherkin-spec
problem_type: runtime_error
component: testing_framework
symptoms:
  - "`TestClock.withLive` throws `TypeError: testClock.withLive is not a function` when a Feature's `liveClock()` is combined with `withLayer(..., { excludeTestServices: true })`"
  - "v4 `@effect/vitest`'s `MethodsNonLive` — the `it` handed to `layer()` — exposes only `effect`, not `live`, so a scenario under a layer cannot opt into a live clock through `it.live`"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
related_components:
  - tooling
tags:
  - live-clock
  - test-clock
  - testenv
  - effect-v4
  - vitest
  - effect-gherkin-spec
  - withlayer
---

# Layered liveClock cannot use TestClock.withLive on effect v4; exclude TestEnv instead

## Problem

Porting `effect-gherkin-spec` to effect / `@effect/vitest` 4.0.0-rc.108, a Feature that asks for a live clock and provides a shared layer crashed at runtime. The layered `liveClock()` path could not reuse the unlayered recipe (`TestClock.withLive` wrapping the scenario effect), and it could not use `it.live` either — the layered `it` does not expose `live`.

## Symptoms

- `TypeError: testClock.withLive is not a function` when the scenario effect executes. The code compiles and registers the test, then dies inside the test body.
- Reproduced with `Feature(...).liveClock().withLayer(layer, { excludeTestServices: true })`. Unlayered `liveClock()` (no `withLayer`) did not throw.

## What Didn't Work

### Wrapping the scenario effect in `TestClock.withLive`

The original layered wiring did `TestClock.withLive(effect)`.

`withLive` is `testClockWith((testClock) => testClock.withLive(effect))` (`TestClock in the vendored effect-v4 tree`). `testClockWith` reads the clock out of the fiber's Ref and casts it to a `TestClock` (`TestClock in the vendored effect-v4 tree`):

```ts
Effect.withFiber((fiber) => f(fiber.getRef(Clock.Clock) as TestClock))
```

That cast is true only when TestEnv (which installs `TestClock.layer()`) is provided. With `excludeTestServices: true`, `@effect/vitest`'s `layer` uses the caller's layer unchanged (`the internal layer builder in the vendored effect-v4 vitest tree`). Clock is then the live `ClockImpl`, which has no `.withLive`.

### Reaching for `it.live` inside the layered mode

`live` exists only on `Methods`, never on `MethodsNonLive`. `MethodsNonLive<R>` exposes `effect` and `layer` (`the vitest Methods surface in the vendored effect-v4 tree`). `Methods` adds `readonly live` (`the vitest Methods surface in the vendored effect-v4 tree`). The `it` handed to a `layer()` callback is `MethodsNonLive<R>` (`repos/effect-v4/packages/vitest/src/internal/internal.ts:224`).

`selectLayeredMode` only receives `Pick<Vitest.MethodsNonLive<R>, 'effect'>` (`the feature kernel of effect-gherkin-spec`), so layered `liveClock()` cannot become an `it.live` registration the way the unlayered mode does (`the feature kernel of effect-gherkin-spec`).

## Solution

In `packages/effect-gherkin-spec/src/feature.kernel.ts` `runWithLayer` and `runWithBoth`:

1. Route `useLiveClock` into `excludeTestServices`:

```ts
effectVitestLayer(layerDef, {
  excludeTestServices: excludeTestServices || useLiveClock,
})
```

(`the feature kernel of effect-gherkin-spec`, `:280-282`)

2. Register the scenario effect as-is through the layered tester — no `TestClock.withLive` wrap (`the feature kernel of effect-gherkin-spec`, `:285-288`).

Unlayered `liveClock()` is unchanged: `selectUnlayeredMode` still picks `it.live` (`the feature kernel of effect-gherkin-spec`).

Regression coverage: `the feature-builder-surfaces integration test of effect-gherkin-spec` drives `.liveClock().withLayer(widgetLayer).withScope(...)` and asserts `Clock.currentTimeMillis` is finite . The package suite is green (111 tests). The fix is on branch `effect--v4-vitest-gherkin`. PR #141 is open and does not yet include this commit (as of this writing).

## Why This Works

`TestClock.withLive` means "run this effect on the real clock while a TestClock is still the ambient Clock." The unchecked `as TestClock` cast (`repos/effect-v4/packages/effect/src/testing/TestClock.ts:471`) is why the failure is a runtime TypeError when that invariant does not hold.

Excluding TestEnv for a live-clock layered feature makes the invariant unnecessary. `@effect/vitest`'s `internal.layer` builds `withTestEnv = excludeTestServices ? layer_ : Layer.provideMerge(layer_, TestEnv)` where `TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())` (`repos/effect-v4/packages/vitest/src/internal/internal.ts:44` and `:237-240`). The caller's layer alone gives a real clock and real console — the same semantics `it.live` gives unlayered tests (`the internal layer builder in the vendored effect-v4 vitest tree`).

## Prevention

- Do not call `TestClock.withLive` unless TestEnv (or another TestClock) is already in the environment.
- A scenario under a layer cannot pick `it.live`. If a layered feature needs a live clock, omit TestEnv (`excludeTestServices: true`) rather than wrapping the effect.
- Excluding TestEnv and wrapping in `withLive` are not composable. Route one `useLiveClock` flag into `excludeTestServices`.
- Cover the crash shape: `.liveClock().withLayer(layer)` plus a finite wall-clock assertion, not `liveClock()` alone.

## Related Issues

- PR #141 — the open v4 port this branch tracks; the liveClock wiring described here is not in that PR yet
- `docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md` — adjacent packaging context for the same port, not this crash
