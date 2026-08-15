import { it } from '@effect/vitest'
import { Gen } from '@systemfsoftware/effect-cell-gen'
import { Cell } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'

/**
 * The order the generated description declares, read off the value itself. The trace the
 * phases collect is compared against THIS, never against `Cell.vocabulary` — the
 * generator rebuilds the description from the walked canonical value, so a comparison
 * against the generator's own input would be circular; the interpreter's contract is the
 * value's declared order.
 */
const declaredOrderOf = (description: Cell.WriteDone<Gen.Bag>): readonly string[] =>
  description.layers.flatMap((layer) => layer.phases.map((phase) => phase.name))

const sameOrder = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((entry, index) => entry === b[index])

/**
 * The interpreter's whole claim, over generated descriptions: it runs each layer's phases
 * in exactly the order the value declares, observed through the phases themselves. An
 * interpreter that interleaved layers by phase position, skipped a phase, ran one twice,
 * or reordered within a layer leaves a trace that disagrees with the declared order.
 *
 * A draw that placed a `Left` at a fatal-convention phase aborts the run before every
 * phase executes, so its trace is an honest prefix of the declared order, not the whole
 * order; the order claim does not apply to that draw. Every other draw — including one
 * carrying a pass-through `Left` — runs every phase and must match the declared order.
 */
it.effect.prop(
  '∀d_Phases_≡Declared',
  [Gen.description],
  ([drawn]) =>
    Effect.gen(function*() {
      if (drawn.failure?.convention === 'either-fail') {
        return true
      }
      const declared = declaredOrderOf(drawn.description)
      yield* Cell.apply(drawn.description, drawn.command)
      return sameOrder(drawn.trace, declared)
    }),
)

/**
 * The description's response is the last layer's. Each layer's write was drawn its own
 * response, so an interpreter that returned the first layer's response, or ran the layers
 * out of declared order, disagrees with the last drawn response whenever the draws differ.
 * A fatal-convention `Left` produces no response at all, so that draw is out of scope.
 */
it.effect.prop(
  '∀d_Response_=LastWrite',
  [Gen.description],
  ([drawn]) =>
    Effect.gen(function*() {
      if (drawn.failure?.convention === 'either-fail') {
        return true
      }
      const response = yield* Cell.apply(drawn.description, drawn.command)
      return response === drawn.lastResponse
    }),
)

/**
 * The fatal convention's routing contract: a drawn `Left` at such a phase fails the whole
 * apply — the payload surfaces on the derived error channel — and produces no write
 * response. Only the layers before the failing one may have completed a write: the
 * failing layer's own write, and every later layer's, must never have run. An interpreter
 * that treated the fatal `Left` as a decision and kept writing fails every clause.
 */
it.effect.prop(
  '∀d_LeftEitherFail_⊥Write',
  [Gen.description],
  ([drawn]) =>
    Effect.gen(function*() {
      const failure = drawn.failure
      if (failure === undefined || failure.convention !== 'either-fail') {
        return true
      }
      const outcome = yield* Effect.either(Cell.apply(drawn.description, drawn.command))
      return (
        Either.isLeft(outcome) &&
        outcome.left === failure.error &&
        drawn.writeObserved.length === failure.layerIndex
      )
    }),
)

/**
 * The pass-through convention's routing contract: a drawn `Left` there is an outcome, not
 * a fault — the successor phase receives the whole `Either` (recorded as the successor's
 * observed input), the write still runs and returns its drawn response, and the `Left`
 * branch's payload travels on to the write (recorded as the write's received input). An
 * interpreter that treated the outcome `Left` as fatal, or unwrapped it before the
 * successor, fails one of the clauses.
 */
it.effect.prop(
  '∀d_LeftEitherPass_=Payload',
  [Gen.description],
  ([drawn]) =>
    Effect.gen(function*() {
      const failure = drawn.failure
      if (failure === undefined || failure.convention !== 'either-pass') {
        return true
      }
      const outcome = yield* Effect.either(Cell.apply(drawn.description, drawn.command))
      if (!Either.isRight(outcome)) {
        return false
      }
      const encodeObserved = drawn.encodeObserved[failure.layerIndex]
      return (
        outcome.right === drawn.lastResponse &&
        encodeObserved !== undefined &&
        Either.isLeft(encodeObserved) &&
        encodeObserved.left === failure.error &&
        drawn.writeObserved[failure.layerIndex] === failure.error
      )
    }),
)
