import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { lookupRun, Running } from './binding.js'
import type { Running as Run } from './binding.js'

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

/**
 * The test's run binding. `bind` hands it to an effect a library runs on a
 * runtime of its own — its own scheduler, a worker, a simulation kernel — so
 * the checks inside it count as this test's assertions, report softly, and see
 * the same `owned` regions as the test itself.
 *
 * @internal
 */
export interface RunBinding {
  readonly bind: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}

const bindingOf = (running: Run | undefined, owned: boolean): RunBinding => ({
  bind: <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self.pipe(
      Effect.provideService(Running, running),
      Effect.provideService(OwnedAssertions, owned),
    ),
})

/**
 * The run binding of the test the caller is executing in.
 *
 * @internal
 */
export const captureRunBinding: Effect.Effect<RunBinding> = Effect.withFiber((fiber) =>
  Effect.succeed(bindingOf(fiber.getRef(Running), fiber.getRef(OwnedAssertions)))
)
