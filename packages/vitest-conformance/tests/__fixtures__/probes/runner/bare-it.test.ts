import { expect, makeMethods } from '@systemfsoftware/vitest'
import { Effect, Ref } from 'effect'
import { it as vitestIt } from 'vitest'

const bareIt = makeMethods(vitestIt)

const seen = Ref.makeUnsafe(0)
const collected: Array<number> = []

const double = (n: number): number => n * 2
const observed = (): number => 1

const assertsNothing = (): void => {
  collected.push(collected.length)
}

bareIt('Should_PassTheBareLane_When_ItsBodyAsserts', () => {
  expect(double(1)).toEqual(2)
})

bareIt('Should_FailTheSecondRun_When_ItsBodyAdvancesACounter', () => {
  const at = Effect.runSync(Ref.getAndUpdate(seen, (n) => n + 1))
  expect(at).toEqual(0)
})

bareIt('Should_FailTheGate_When_ItsBodyCountsNoForkedCheck', assertsNothing)

bareIt('Should_RefuseTheAsyncBody_When_ItsBodyReturnsAPromise', () => {
  expect(observed()).toEqual(1)
  return Promise.resolve()
})

bareIt('Should_RefuseTheReturnedEffect_When_ItsBodyReturnsOne', () => {
  expect(observed()).toEqual(1)
  return Effect.void
})
