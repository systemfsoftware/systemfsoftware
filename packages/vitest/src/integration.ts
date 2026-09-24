/**
 * The integration entry (KTD5): the types a library writes its verdicts with, the marker it calls between the
 * observations of one flow, and the binding it carries onto a runtime of its own.
 *
 * @since 4.0.0
 */
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import type * as V from 'vitest'
import { Asserted, type AssertedShape } from './internal/checks.js'
import { VitestTestContext } from './internal/test-context.js'

export type { Asserted, AssertedShape, Check, Expect } from './internal/checks.js'

/**
 * A flow that asserts more than once marks each assertion point with this, so the check after it is that
 * state's one check (KTD5).
 *
 * @since 4.0.0
 */
export const step = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | Asserted> =>
  Effect.flatMap(Asserted, (asserted) => Effect.andThen(Effect.sync(() => asserted.step()), self))

/**
 * The test's run, as a library hands it to a runtime of its own: `bind` provides what a check reads off the
 * test's own fiber — the ledger — so the checks the other runtime runs count as this test's assertions, and the
 * bound effect no longer requires `Asserted`, which is what lets it cross into a runtime that cannot know it.
 *
 * @since 4.0.0
 */
export interface RunBinding {
  readonly bind: <A, E, R>(self: Effect.Effect<A, E, R | Asserted>) => Effect.Effect<A, E, R>
}

const boundContext = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  ctx: V.TestContext | null | undefined,
): Effect.Effect<A, E, R> =>
  Option.match(Option.fromNullishOr(ctx), {
    onNone: () => self,
    onSome: (value) => Effect.provideService(self, VitestTestContext, value),
  })

const bindingOf = (asserted: AssertedShape, ctx: V.TestContext | null | undefined): RunBinding => ({
  bind: <A, E, R>(self: Effect.Effect<A, E, R | Asserted>): Effect.Effect<A, E, R> =>
    boundContext(Effect.provideService(self, Asserted, asserted), ctx),
})

/**
 * The run binding of the test the caller is executing in: the ledger its checks count on, and the running task
 * context. Capture it from inside a test — the capture requires `Asserted`, so a library cannot mistake a run
 * binding for something the outside has — and bind the effect before handing it to a runtime of its own.
 *
 * @since 4.0.0
 */
export const captureRunBinding: Effect.Effect<RunBinding, never, Asserted> = Effect.gen(function*() {
  const asserted = yield* Asserted
  const ctx = Option.getOrUndefined(yield* Effect.serviceOption(VitestTestContext))
  return bindingOf(asserted, ctx)
})
