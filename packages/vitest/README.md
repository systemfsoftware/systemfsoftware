# @systemfsoftware/vitest

A fork of [`@effect/vitest`](https://github.com/Effect-TS/effect/tree/main/packages/vitest) whose defaults make the lazy test a good test. Write the obvious thing and you get a fresh build of your services, a second run that catches leaked state, virtual time, checks that stop the test at its next step, and properties refuted against a constant impostor. Write the slop form and the refusal names the rewrite.

Everything upstream exports is still exported: `it`, `test`, `it.effect`, `it.live`, `it.scoped`, `it.each`, `it.layer`, `layer`, `describe`, `expect`, `it.prop`, `it.effect.prop`, `flakyTest`, `addEqualityTesters`, `makeMethods`, `describeWrapped`, and `export * from "vitest"`. Two things do differ from upstream: `describe` is the fork's lawful collector, and four accepted-input types are narrower — both are listed under [Compatibility](#compatibility-with-effectvitest). On top of that surface the fork adds six things: `owned`, `recordAssertion`, `captureRunBinding`, `layer(L, { shared: true })`, a lawful `it.prop`, and `VitestTestContext` — the running test's context, published so a library can read it. `layer`, `it.layer`, `flakyTest`, `it.prop`, `it.effect`, `it.live`, `describeWrapped` and `it` itself also take a data-last form (`it.effect(body, timeout?)(name)`, `layer(options)(L)`, `flakyTest(timeout?)(effect)`), so they pipe.

The defaults are forced, not opted into. Every package in this workspace resolves `@effect/vitest` here through a pnpm alias, so libraries keep importing from `@effect/vitest` and never name this package.

## Install

```bash
pnpm add -D @systemfsoftware/vitest
```

To keep the upstream specifier — the one every library published against `@effect/vitest` expects — alias it:

```jsonc
// package.json
{ "devDependencies": { "@effect/vitest": "workspace:@systemfsoftware/vitest@*" } }
```

```bash
# outside a pnpm workspace
npm install -D @effect/vitest@npm:@systemfsoftware/vitest
```

> [!NOTE]
> `effect` and `vitest` are peer dependencies — you bring your own, on the `effect` 4.0.0-rc line.

## Quick start

```ts
import { expect, it, layer } from '@effect/vitest'
import { Context, Effect, Layer, Ref } from 'effect'

class Store extends Context.Service<Store, Ref.Ref<ReadonlyArray<string>>>()('Store') {
  static readonly layer = Layer.effect(Store, Ref.make<ReadonlyArray<string>>([]))
}

layer(Store.layer)('store', (it) => {
  it.effect('starts from an empty store', () =>
    Effect.gen(function*() {
      const store = yield* Store
      const items = yield* Ref.get(store)
      expect(items).toEqual([])
    }))
})
```

The layer is built fresh for the test, and the test runs twice on two different builds. A test that only passes the first time is a test that leaked state.

## Layers

Every test gets its own build of its layers. A write to the store above is invisible to the next test in the block, and a nested `layer` inherits the block's sharing rather than rebuilding the outer layer per test.

`layer(L, { shared: true })` is the only way to build once for a block. The first test's write becomes the second test's input, and nothing in that block runs twice. Declare it deliberately: sharing is how state leaking between tests becomes the accepted norm.

## Leaked state

A passing test outside a declared-shared block runs a second time on a fresh build of its services. If the second run fails, the test fails as `LeakedState`, and the message carries the second run's failure:

> ✗ this test passed, then failed when run again on a fresh build of its services: something keeps state outside its layer, so tests here see each other's changes. The second run failed with: _the second run's failure_

That is how a module-level counter, a shared cache, or a process-global histogram gets reported instead of staying green. `it.live` is re-run too, so a real-resource suite gets the same check. A declared-shared block is the one exception.

## Concurrency and shuffle

Tests inside a block run concurrently and in shuffled order, and each concurrent test keeps its own failure list and assertion counts. Concurrency is what makes a cross-test leak reproducible: two tests that interleave are two tests whose state must not be shared. Nothing else pins their order.

A failure in a shuffled block names the seed the run used. Pass that seed back with `--sequence.seed=<seed>` and the same order replays, so an order-dependent failure stops being intermittent.

## Checks

`expect` records softly within one Effect step. Every failed check in the step is reported, and before any of the test's fibers takes its next step after a failed check, that fiber is interrupted — the step after a failed check never runs its side effects, which would only act on a state already known wrong. A child fiber is interrupted too. Anything thrown after a failed check is reported as `AfterFailedExpect`, most likely caused by the failure above it.

`toEqual` compares with Effect `Equal`, so two values that are structurally equal but different references are equal. A test that asserts nothing fails: the code under test returned something, so assert on it. A testing library whose checks are Effect-native can count them through `recordAssertion()`.

## Virtual time

Effect bodies run on virtual time that advances only when the test's fibers are idle. `Effect.sleep("3 seconds")` returns without waiting; on a deadline tie the background sleepers wake before the test fiber; fractional-millisecond schedules work.

```ts
import { expect, it } from '@effect/vitest'
import { Clock, Effect } from 'effect'

it.effect('three seconds pass at once', () =>
  Effect.gen(function*() {
    const before = yield* Clock.currentTimeMillis
    yield* Effect.sleep('3 seconds')
    const after = yield* Clock.currentTimeMillis
    expect(after - before).toEqual(3000)
  }))
```

`TestClock.adjust` still moves the clock — on virtual time, adjusting is letting that much time pass, which is the one clock move a test can ask for. Effect v3 code that imports `TestClock` from `effect/TestClock` resolves to this fork's compat entry, `@effect/vitest/TestClock`, through the shared Vitest config's `effect/TestClock` alias.

## Refusals

Each refusal states its rewrite, in the same words at compile time and at run time:

| Refused                                                                                                               | The rewrite in the message                                                                                               |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `expect(x).toBeDefined()`, `.toBeTruthy()`, `.toBeFalsy()`, and the negated `.not.toBeNull()`, `.not.toBeUndefined()` | Assert the value: `toEqual(expected)`; for a key that must exist: `toHaveProperty(key)`                                  |
| `beforeEach` / `afterEach`                                                                                            | Build what a test needs inside it; services come fresh per test from `layer(Service.layer)((it) => { ... })`             |
| an `async` test body                                                                                                  | Return the Effect instead: `it.effect(name, () => Effect.gen(function* () { ... }))`                                     |
| an Effect body that needs a service nothing provides                                                                  | Pipe the body through `Effect.provide(Service.layer)`, or write the tests inside `layer(Service.layer)((it) => { ... })` |
| the positional `it.prop(name, [arbitraries], predicate)`                                                              | Name the function under test and pass a budget: `it.prop(name, { of, subject, runs }, holds)`                            |
| a test with no assertion (at run time only)                                                                           | Assert on what the code returned: `expect(actual).toEqual(expected)`                                                     |

A presence refusal reads exactly like this:

> ✗ toBeDefined passes for almost any value the code returns. Assert the value: toEqual(expected); for a key that must exist: toHaveProperty(key).

`expect(<boolean>)` is a type error — a boolean can only report `expected false to be true`. Pass the two values instead: `expect(a).toEqual(b)`, which uses Effect `Equal`, or a predicate: `expect(value).toSatisfy(predicate)`. A boolean the code under test returned stays legal. `toBe` on primitives, `toBeTypeOf` and `toBeInstanceOf` are not refused.

## Properties

A property names the function under test. It runs `runs` times; omit `runs` and the run's configured default applies:

```ts
import { expect, it } from '@effect/vitest'
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

A library that registers tests for its users wires in with two calls.

`owned(effect)` marks a region where `expect` throws instead of recording softly, so the enclosing Effect sees a failed check as a failure in its cause:

```ts
import { owned } from '@effect/vitest'
import { Effect } from 'effect'

// A library wraps the user's step; a failed check inside fails the step.
export const runStep = <A, E, R>(step: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => owned(step)
```

`recordAssertion()` counts an Effect-native check as an assertion, so a test whose only judgement is the library's own passes the no-assertion gate:

```ts
import { recordAssertion } from '@effect/vitest'
import { Effect } from 'effect'

export const recordVerdict = (): Effect.Effect<void> => Effect.sync(recordAssertion)
```

`captureRunBinding` is the test's run binding. `bind` re-provides it to an effect a library runs on a runtime of its own — its own scheduler, a worker, a simulation kernel — so the checks inside it count as that test's assertions, report softly, and see the same `owned` regions as the test. Capture it from the test's own fiber and bind the effect before handing it to the other runtime:

```ts
import { captureRunBinding } from '@effect/vitest'
import { Effect } from 'effect'

export const runOnOwnScheduler = <A, E>(
  program: Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.gen(function*() {
    const binding = yield* captureRunBinding
    return yield* Effect.promise(() => Kernel.run(binding.bind(program)))
  })
```

`VitestTestContext` is the running Vitest `TestContext` under the key `vitestTestContextKey`, provided on every test the fork runs. A library that carries its own view of the task context builds it on that key, so a case lane and a property lane read the same context:

```ts
import { vitestTestContextKey } from '@effect/vitest'
import { Context } from 'effect'

export const TaskRef = Context.Reference<{ annotate?: (message: string) => void } | null>(vitestTestContextKey, {
  defaultValue: () => null,
})
```

## Compatibility with @effect/vitest

Everything upstream exports is still exported, and the fork adds behaviour rather than removing bindings: example tests, `it.each`, `toStrictEqual` and the other Vitest bindings stay. It is not a drop-in, though, in one behaviour and four accepted-input types:

- `describe` is the fork's lawful collector (R4), not upstream's: it forces the fork's concurrency and shuffle defaults and hands its body the fork's methods. Vitest's own collector — one test at a time, in declaration order — stays reachable as `import { describe } from 'vitest'`.
- `deepStrictEqual`, `notDeepStrictEqual`, `strictEqual` and `assertEquals` take no message argument. A data-last dual has to repeat its data-first twin parameter for parameter, so a trailing string cannot be told from an expected value; the message is refused rather than silently dropped.
- `skipIf` and `runIf` take a `boolean` condition where upstream took `unknown`, and `each` cases must be objects (`T extends object`). An `unknown` or `any` condition is refused by this repo's lint.
- `assertTrue` takes a `boolean` where upstream took `unknown`, for the same reason.

What else differs is what runs by default, what `expect` refuses, and what `toEqual` means — that is the reason for the alias.

This package is part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware).

## License

MIT.
