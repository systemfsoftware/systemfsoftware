import { makeMethods } from '@effect/vitest'
import { Effect, Ref } from 'effect'
import { it as vitestIt } from 'vitest'

const bareIt = makeMethods(vitestIt)

const seen = Ref.makeUnsafe(0)
const collected: Array<number> = []

const double = (n: number): number => n * 2

const assertsNothing = (): void => {
  collected.push(collected.length)
}

const noCheckBody = function*() {
  assertsNothing()
  yield* Effect.void
}

const asyncBody = (): Promise<void> => Promise.resolve()

const effectBody = (): Effect.Effect<void> => Effect.void

bareIt('Should_PassTheBareLane_When_ItsBodyAsserts', function*({ expect }) {
  yield* expect(double(1)).toEqual(2)
})

bareIt('Should_FailTheSecondRun_When_ItsBodyAdvancesACounter', function*({ expect }) {
  const at = yield* Ref.getAndUpdate(seen, (n) => n + 1)
  yield* expect(at).toEqual(0)
})

// @ts-expect-error ✗ this test yields no check, so it cannot fail. Yield one from the test's own expect: it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) }). An expect imported from vitest does not count.
bareIt('Should_FailTheGate_When_ItsBodyCountsNoForkedCheck', noCheckBody)

// @ts-expect-error ✗ an async body runs outside the test runtime. Pass a generator: it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) }).
bareIt('Should_RefuseTheAsyncBody_When_ItsBodyReturnsAPromise', asyncBody)

// @ts-expect-error ✗ the body returned an Effect, so the runner cannot see its steps. Pass the generator itself: it(name, function* ({ expect }) { ... }).
bareIt('Should_RefuseTheReturnedEffect_When_ItsBodyReturnsOne', effectBody)
