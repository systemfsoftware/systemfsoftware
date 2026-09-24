import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { lookupRun } from './binding.js'
import type { Running } from './binding.js'

/** @internal */
export const OwnedAssertions = Context.Reference<boolean>('effect-vitest/owned', {
  defaultValue: () => false,
})

/** @internal */
export const isOwned = (): boolean => Fiber.getCurrent()?.getRef(OwnedAssertions) === true

/** @internal */
export const owned = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.provideService(self, OwnedAssertions, true)

/**
 * Counts an Effect-native check as an assertion of the run it happens in, so the run's own gate sees it.
 *
 * @internal
 */
export const recordAssertion = (): void => {
  const run = lookupRun()
  if (run !== undefined) bump(run)
}

const bump = (run: Running): void => {
  const { expect } = run.ctx
  expect.setState({ assertionCalls: expect.getState().assertionCalls + 1 })
}
