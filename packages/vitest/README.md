# @systemfsoftware/vitest

A fork of [`@effect/vitest`](https://github.com/Effect-TS/effect/tree/main/packages/vitest) whose defaults make the lazy test a good test. `expect` is the parameter of the test's own body, every check is yielded, and one observed state gets one check. Write the obvious thing and you also get a fresh build of your services, a second run that catches leaked state, virtual time, and properties refuted against a constant impostor. Write the slop form and the refusal names the rewrite.

Everything upstream exports is still exported except what the callback parameter replaces. `it`, `test`, `it.live`, `it.each`, `it.layer`, `layer`, `describe`, `it.prop`, `it.effect.prop`, `flakyTest`, `addEqualityTesters`, `makeMethods` and `describeWrapped` are here; `expect` and `assert` are not; `it.effect`, `it.scoped` and `it.scopedLive` are refusals carrying the generator rewrite; and the Vitest values the fork keeps are re-exported by name — the list is under [Compatibility](#compatibility-with-effectvitest). Two things differ from upstream: `describe` is the fork's lawful collector, and four accepted-input types are narrower. On top of that surface the fork adds `@systemfsoftware/vitest/integration` (`step`, `captureRunBinding`), `layer(L, { shared: true })`, a lawful `it.prop`, and `VitestTestContext` — the running test's context, published so a library can read it. `it`/`test`/`it.live`/`describeWrapped`/`layer`/`flakyTest` also take a data-last form (`it(body, timeout?)(name)`), so they pipe.

The defaults are forced, not opted into. Every package in this workspace imports `@systemfsoftware/vitest` by its own name, and published packages peer on it directly — nothing resolves through an alias to the upstream specifier.

## Install

```bash
pnpm add -D @systemfsoftware/vitest
```

Every workspace package and published library imports `@systemfsoftware/vitest` by its own name — there is no alias to the upstream specifier, so a manifest names the runner its tests actually run. Outside a pnpm workspace, install it directly:

```bash
# outside a pnpm workspace
npm install -D @systemfsoftware/vitest
```

> [!NOTE]
> `effect` and `vitest` are peer dependencies — you bring your own, on the `effect` 4.0.0-rc line.

## Quick start

```ts
import { it, layer } from '@systemfsoftware/vitest'
import { Context, Effect, Layer, Ref } from 'effect'

class Store extends Context.Service<Store, Ref.Ref<ReadonlyArray<string>>>()('Store') {
  static readonly layer = Layer.effect(Store, Ref.make<ReadonlyArray<string>>([]))
}

layer(Store.layer)('store', (it) => {
  it('starts from an empty store', function*({ expect }) {
    const store = yield* Store
    const items = yield* Ref.get(store)
    yield* expect(items).toEqual([])
  })
})
```

A test body is a generator, and the runner drives it: `yield*` a service, an Effect or a check. The layer is built fresh for the test, and the test runs twice on two different builds — a test that only passes the first time is a test that leaked state.

## Checks

`expect` is not importable. The only one in reach is the `{ expect }` the body receives, so a check is bound to its test by construction. Every matcher returns a **check**: an `Effect` that needs the runner's `Asserted` service, which is why it has to be yielded.

```ts
it('ships a pending order', function*({ expect }) {
  const order = yield* shop.place(items)
  yield* expect(order).toMatchObject({ id: 1, status: 'Pending' })
})
```

- **One check per observed state.** A second check before the body's next non-check step — and a check inside a loop — is refused with `assert the state once` and the rewrite. A `yield*` of anything that is not a check opens a new observed state, so `yield* TestClock.adjust('3 seconds')` between two checks is a second state.
- **A check that fails stops the test there.** The generator is returned, so `finally` blocks and scope finalizers still run, and the report carries the diff.
- **A body that yields no check is refused** at the test name (compile time) and at run time; a check that is written but never yielded is refused as `written but never yielded`.
- **`toEqual` compares with Effect `Equal`**, so two structurally equal values of different references are equal.
- **The vocabulary is curated.** `toEqual`, `toStrictEqual`, `toBe`, `toContain`, `toMatch`, `toMatchObject`, `toThrow(X)`, `toSatisfy(fn, why)`, the call-ordering matchers, the ordered comparisons, and `objectContaining`/`arrayContaining`/`stringMatching`/`closeTo`/`any`/`schemaMatching` are kept. Everything weak is refused by name (see [Refusals](#refusals)), and a `boolean` actual is a type error — a boolean can only report `expected false to be true`.

### The guard

A check is the only way to assert, and the guard is what makes that true rather than advisory. `@systemfsoftware/vitest/guard` installs a wrapper over chai's assertion prototype and marks every task the fork registers. The shared Vitest config loads it into every test project, inline projects included, so no import is needed. A project stays out only when vitest-config's exemption table names it together with the foreign runner that registers its tests (oxlint's `RuleTester`, Storybook's plugin). A package outside that table that cannot resolve `@systemfsoftware/vitest/guard` fails at config load rather than running unguarded. Under it:

- **a raw `vitest` `expect` (or `assert`) is refused**, even beside a real check: "✗ an expect imported from vitest ran; take it from the test callback: it(name, function\* ({ expect }) { ... })";
- **a test registered with `vitest`'s own `it`/`test` is refused**: "✗ this test was registered with vitest's it; import it from @systemfsoftware/vitest".

## Lanes

```ts
import { describe, it, layer } from '@systemfsoftware/vitest'

it(name, function*({ expect }) { /* virtual time */ })
it.live(name, function*({ expect }) { /* the real clock */ })
it.each(rows)(name, function*(row, { expect }) { /* Vitest's it.for order */ })
layer(Service.layer)((it) => { it(name, function*({ expect }) { ... }) })
describe('a block', (it) => { ... })
```

`it`, `test`, `it.live`, `it.each`, `it.only`, `it.skip`, `it.skipIf`, `it.runIf`, `it.fails`, `it.layer`, `layer` and `describeWrapped` all take a generator body. `it`/`test`/`it.live`/`describeWrapped`/`layer`/`flakyTest` also take a data-last form (`it(body, timeout?)(name)`), so they pipe. `it.prop`, `it.effect.prop`, `it.law` and `flakyTest` are unchanged from #512.

The habit lanes are refusals, not aliases: `it.effect`, `it.scoped` and `it.scopedLive` are compile-time errors and run-time throws carrying the generator rewrite. `it.effect.prop` still runs properties. `beforeEach` and `afterEach` are refused too — build what a test needs inside it; services come fresh per test from `layer`.

## Layers

Every test gets its own build of its layers. A write to the store above is invisible to the next test in the block, and a nested `layer` inherits the block's sharing rather than rebuilding the outer layer per test.

`layer(L, { shared: true })` is the only way to build once for a block. The first test's write becomes the second test's input, and nothing in that block runs twice. Declare it deliberately: sharing is how state leaking between tests becomes the accepted norm.

## Leaked state

A passing test outside a declared-shared block runs a second time on a fresh build of its services. If the second run fails, the test fails as `LeakedState`, and the message carries the second run's failure:

> ✗ this test passed, then failed when run again on a fresh build of its services: something keeps state outside its layer, so tests here see each other's changes. The second run failed with: _the second run's failure_

That is how a module-level counter, a shared cache, or a process-global histogram gets reported instead of staying green. `it.live` is re-run too, so a real-resource suite gets the same check. A declared-shared block is the one exception.

## Concurrency and shuffle

Tests inside a block run concurrently and in shuffled order, and each concurrent test keeps its own failure list and check counts. Concurrency is what makes a cross-test leak reproducible: two tests that interleave are two tests whose state must not be shared. Nothing else pins their order.

A failure in a shuffled block names the seed the run used. Pass that seed back with `--sequence.seed=<seed>` and the same order replays, so an order-dependent failure stops being intermittent.

## Virtual time

Test bodies run on virtual time that advances only when the test's fibers are idle. `Effect.sleep("3 seconds")` returns without waiting; on a deadline tie the background sleepers wake before the test fiber; fractional-millisecond schedules work.

```ts
import { it } from '@systemfsoftware/vitest'
import { Clock, Effect } from 'effect'

it('three seconds pass at once', function*({ expect }) {
  const before = yield* Clock.currentTimeMillis
  yield* Effect.sleep('3 seconds')
  const after = yield* Clock.currentTimeMillis
  yield* expect(after - before).toEqual(3000)
})
```

`TestClock.adjust` still moves the clock — on virtual time, adjusting is letting that much time pass, which is the one clock move a test can ask for. Effect v3 code that imports `TestClock` from `effect/TestClock` resolves to this fork's compat entry, `@systemfsoftware/vitest/TestClock`, through the shared Vitest config's `effect/TestClock` alias.

## Refusals

Each refusal states its rewrite, in the same words at compile time (a `this` type, an argument union, or the test name) and at run time:

| Refused                                                                       | The rewrite in the message                                                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `toBeDefined`, `toBeTruthy`, `toBeFalsy`, `not.toBeNull`, `not.toBeUndefined` | Assert the value: `yield* expect(actual).toEqual(expected)`                                                                          |
| `toHaveLength`                                                                | Assert the contents: `toEqual([...])`; only some of them: `toEqual(expect.arrayContaining([...]))`                                   |
| `toHaveProperty`                                                              | Assert the shape once: `toMatchObject({ key: value, ... })`                                                                          |
| `toBeInstanceOf`, `toBeTypeOf`                                                | Assert the value: `toEqual(expected)`; only its shape: `toEqual(expect.schemaMatching(Schema))`                                      |
| `toHaveBeenCalled`, `toHaveBeenCalledTimes`                                   | `toHaveBeenCalledExactlyOnceWith(...args)`, or `expect(spy.mock.calls).toEqual([[...], [...]])`                                      |
| every snapshot matcher                                                        | State the expected value: `toEqual(expected)`; for a throw: `toThrow(MyError)`                                                       |
| `expect.anything`, `.resolves`, `.rejects`, `expect.poll`, `expect.soft`      | Name what the value must be, yield the Effect, or let virtual time pass                                                              |
| `toThrow()`, `toThrowError()`, `toSatisfy(fn)`, `toMatchObject({})`           | Name the error, the reason, or the fields: `toThrow(MyError)`, `toSatisfy(predicate, "why")`, `toMatchObject({ status: "Pending" })` |
| a `boolean` actual                                                            | Pass the two values instead: `expect(a).toEqual(b)`; a predicate: `toSatisfy(predicate, "what must hold")`                           |
| a second check on one state                                                   | Assert the state once: `toMatchObject({...})`, `expect({ a, b }).toEqual({...})`, or `it.each` for several inputs                    |
| a check written but never yielded                                             | Yield it: `yield* expect(actual).toEqual(expected)`                                                                                  |
| a body that yields no check                                                   | Yield one from the test's own `expect`                                                                                               |
| a sync body, an `async` body, a body returning an Effect                      | Pass the generator itself: `it(name, function* ({ expect }) { ... })`                                                                |
| `it.effect` / `it.scoped` / `it.scopedLive`                                   | `it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) })`                                  |
| `beforeEach` / `afterEach`                                                    | Build what a test needs inside it; services come fresh per test from `layer(Service.layer)((it) => { ... })`                         |
| a body that needs a service nothing provides                                  | Write the test inside `layer(Service.layer)((it) => { ... })`; every test gets its own fresh build                                   |
| the positional `it.prop(name, [arbitraries], predicate)`                      | Name the function under test and pass a budget: `it.prop(name, { of, subject, runs }, holds)`                                        |

A named refusal reads exactly like this:

> ✗ toHaveLength checks how many, not which. Assert the contents: toEqual([...]); only some of them: toEqual(expect.arrayContaining([...])).

## Properties

A property names the function under test. It runs `runs` times; omit `runs` and the run's configured default applies:

```ts
import { it } from '@systemfsoftware/vitest'
import { Schema as S } from 'effect'

const sort = (xs: ReadonlyArray<number>): ReadonlyArray<number> => [...xs].sort((a, b) => a - b)
const isOrdered = (xs: ReadonlyArray<number>): boolean => xs.every((x, i) => i === 0 || (xs[i - 1] ?? x) <= x)

it.prop(
  'sorting is ordered',
  { of: [S.Array(S.Int)], subject: sort },
  (sort, [xs]) => isOrdered(sort(xs)),
)
```

`of` takes a tuple or a record of `Schema` arbitraries (`{ of: { list: S.Array(S.Int) } }`), and `holds` receives the subject first and the generated values second. `runs` is optional and must be a positive integer when given. The effective check options merge field by field: the property's own fields win over the configured default (`test.provide`, set by `@systemfsoftware/vitest-config`: 30 in a Stryker worker, 1000 in CI, 100 otherwise) over the built-in `runs: 100`, so `{ runs: 3 }` still inherits the configured `size` and caps. `it.effect.prop` is the same shape with `holds` returning `Effect<boolean>`. A verdict that is not a literal boolean, or an `Effect` of one, fails as `NonBooleanVerdict`; a `runs` that is not a positive integer — from the property or from the configured default — fails as `InvalidBudget`, naming where the bad value came from; the positional form fails as a type error and a refusal.

### The constant-impostor gate

After a property holds, it runs again against a constant impostor of its subject — a fake that returns the first output forever, whatever the input. Each subject is judged across every property in its file, when the file ends. If nothing in the file refutes the impostor, the file fails `VacuousProperty`:

> sort: no property in this file refuted the constant impostor of \`sort\`, so nothing here pins it down. … Laws that only relate outputs to each other (additivity, idempotence, commutativity, round trips through the subject) hold for such constants. Pin the output to the input: compare against an independent model (\`subject(x)\` equals a straightforward reimplementation), or conjoin a base case (\`subject([one])\` equals its known value). Also check that the body calls the \`subject\` it was given, not the imported implementation.

`sorting is ordered` alone is vacuous, because a constant empty array is also ordered. A law that pins the output to an input refutes the impostor for that subject:

```ts
it.law.model('agree with insertion sort', { of: [S.Array(S.Int)], subject: sort }, insertionSort)
```

### Law kinds

`it.law.model` (an independent oracle), `it.law.metamorphic` (the input transform), `it.law.roundTrip` (the encode/decode pair) and `it.law.invariant` (a predicate on the output) are sugar over the same gate.

`it.law.idempotent` and `it.law.deterministic` are declared exempt. They skip the impostor gate, they are reported as exempt in the run, and they are the only exemptions:

```ts
it.law.idempotent('sorting twice changes nothing', { of: [S.Array(S.Int)], subject: sort, runs: 50 })
```

### Coverage classes

A property may declare coverage classes: labelled input predicates, each with a minimum share of runs.

```ts
it.prop(
  'sorting is ordered',
  {
    of: [S.Array(S.Int)],
    subject: sort,
    runs: 400,
    cover: { singletons: [(values) => values.length === 1, 0.9] },
  },
  (sort, [xs]) => isOrdered(sort(xs)),
)
```

A class fails only when a sequential statistical test is confident its share is below the minimum, and passes once it is confident the share is at least 0.9 of the minimum — QuickCheck's `checkCoverage` settings, certainty 10⁹ and tolerance 0.9. The tolerance is what lets the check terminate: a class sitting exactly on its minimum would otherwise draw forever. `runs` is therefore a minimum run count, not a maximum, and the failure names the label and the observed share.

## For testing libraries

A library takes the test's `expect` by parameter and ends in a check:

```ts
import type { Check, Expect } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

export const runContract = (expect: Expect) =>
  Effect.gen(function*() {
    const report = yield* reportOf()
    yield* expect(report).toMatchObject({ holds: true })
  })
```

A flow that asserts at several points marks each point with `step` from `@systemfsoftware/vitest/integration`, so every phase opens its own observed state and each gets one check:

```ts
import { step } from '@systemfsoftware/vitest/integration'
import { Effect } from 'effect'

export const runPipeline = (expect: Expect) =>
  Effect.gen(function*() {
    yield* step(yield* phaseOne())
    yield* expect(yield* phaseOne()).toMatchObject({ ok: true })
    yield* step(yield* phaseTwo())
    yield* expect(yield* phaseTwo()).toMatchObject({ ok: true })
  })
```

`captureRunBinding` — from `@systemfsoftware/vitest/integration` — is the test's run binding. Capture it inside the test, then `bind` the effect before handing it to a runtime of your own — its own scheduler, a worker, a simulation kernel — so its checks count as that test's assertions. `bind` provides what a check reads off the test's own fiber (the ledger, and the running task context) and the bound effect no longer requires `Asserted`, which is what lets it cross into a runtime that cannot know the ledger. Every run of a bound effect opens its own observed state, so a runtime that re-runs it — a kernel's baseline and its seeded replays — checks each run once; two checks inside one run are still refused:

```ts
import { captureRunBinding } from '@systemfsoftware/vitest/integration'
import { Effect } from 'effect'

export const runOnOwnScheduler = <A, E>(
  program: Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.gen(function*() {
    const binding = yield* captureRunBinding
    return yield* Effect.promise(() => Kernel.run(binding.bind(program)))
  })
```

`VitestTestContext` is the running Vitest `TestContext` under the key `vitestTestContextKey`, provided on every test the fork runs — every generator lane, both property lanes, and each `it.each` row. A library that carries its own view of the task context builds it on that key, so a case lane and a property lane read the same context:

```ts
import { vitestTestContextKey } from '@systemfsoftware/vitest'
import { Context } from 'effect'

export const TaskRef = Context.Reference<{ annotate?: (message: string) => void } | null>(vitestTestContextKey, {
  defaultValue: () => null,
})
```

There is no `owned`, no `recordAssertion` and no `@systemfsoftware/vitest/utils`: a library reports through the caller's check, and the one-check rule is what keeps a verdict a verdict.

## Compatibility with @effect/vitest

This is a fork of the surface, not a superset of it. What changed:

- **No `expect` and no `assert`**, from this package or from its `vitest` re-export; the callback parameter replaces both (and the guard refuses a raw one).
- **No `it.effect`, `it.scoped`, `it.scopedLive`, `owned`, `recordAssertion`, `@systemfsoftware/vitest/utils`, or `@systemfsoftware/vitest/refusals`.** `it.effect.prop` remains. `it.live` is a generator body on the real clock.
- **`export * from "vitest"` is gone.** The Vitest values the fork keeps — `vi`, `expectTypeOf`, `assertType`, `beforeAll`, `afterAll`, `onTestFailed`, `onTestFinished`, `inject`, `recordArtifact`, `vitest` — are re-exported explicitly, so a refused value cannot arrive through a star export.
- **A test body is a generator**, so a sync, `async` or Effect-returning body is refused with the rewrite.
- **`describe` is the fork's lawful collector** (forced concurrency and shuffle, the fork's methods), not upstream's. Vitest's own collector stays reachable as `import { describe } from 'vitest'`.
- **`skipIf` and `runIf` take a `boolean`**, where upstream took `unknown`; an `unknown` or `any` condition is refused by this repo's lint.

What else differs is what runs by default, what a check refuses, and what `toEqual` means — that is why the fork is imported under its own name rather than aliasing upstream.

This package is part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware).

## License

MIT.
