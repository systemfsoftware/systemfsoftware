/**
 * The fork's own suite. It is the package whose runner every other package's
 * tests exercise, so its concurrency sites (the `Effect.scoped` in each lane)
 * run only here and only when this file drives them: `layer`, a shared
 * `layer`, `it`, `it.live`, and `flakyTest`.
 *
 * The fork is a runner-driving package (see `RAW_VITEST_PACKAGES`), so this is a
 * plain Vitest suite rather than a consumer lane: a `.integration.test.ts` here
 * would need the Gherkin harness, which depends on this package. The fork does
 * not load its own guard either — nothing here wraps chai — so these lanes are
 * held to the surface by what each body yields.
 */
import { flakyTest, it, layer } from '@systemfsoftware/vitest'
import { Context, Effect, Layer, Ref } from 'effect'

class Counter extends Context.Service<Counter, Ref.Ref<number>>()('@systemfsoftware/vitest/Counter') {
  static readonly layer = Layer.effect(Counter, Ref.make(0))
}

const increment = Effect.gen(function*() {
  const counter = yield* Counter
  yield* Ref.update(counter, (value) => value + 1)
  return yield* Ref.get(counter)
})

layer(Counter.layer)('the fork builds a fresh layer for each test', (it) => {
  it('Should_GiveEveryTestItsOwnCounter_When_LayerBlockRuns', function*({ expect }) {
    yield* expect(yield* increment).toEqual(1)
    yield* expect(yield* increment).toEqual(2)
  })
})

layer(Counter.layer, { shared: true })('the fork can share one layer across a block', (it) => {
  it('Should_KeepTheEarlierWrite_When_TheLayerIsShared', function*({ expect }) {
    yield* expect(yield* increment).toEqual(1)
    yield* expect(yield* increment).toEqual(2)
  })
})

it('Should_RetryUntilItStopsFailing_When_TheProgramIsFlaky', function*({ expect }) {
  const attempts = yield* Ref.make(0)
  const flaky = Ref.updateAndGet(attempts, (value) => value + 1).pipe(
    Effect.filterOrFail((attempt) => attempt >= 2, () => 'not yet' as const),
    Effect.asVoid,
  )
  yield* flakyTest(flaky)
  yield* expect(yield* Ref.get(attempts)).toEqual(2)
})

it.live('Should_RunOnTheRealClock_When_TheLaneIsLive', function*({ expect }) {
  yield* expect(yield* Effect.succeed('live')).toEqual('live')
})
