import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import type { Kind as HKTKind, TypeLambda as HKTTypeLambda } from 'effect/HKT'
import type { Layer } from 'effect/Layer'
import * as Option from 'effect/Option'
import type { Pipeable } from 'effect/Pipeable'
import { Prototype } from 'effect/Pipeable'
import * as Result from 'effect/Result'

/**
 * The nominal brand every `Cell` carries. The `Sandwich` chain's `write` is the only door that applies it.
 */
export const CellTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Cell')

/**
 * The nominal brand type of {@link CellTypeId}.
 */
export type CellTypeId = typeof CellTypeId

/**
 * A Cell is one sandwich: a `read` that gathers, a `decide` that refuses or rules, and a
 * `write` that acts — compiled into a single function from command to response. The `E`
 * channel carries the infrastructure refusals; the `R` channel carries the services the
 * phases `yield*`, provided once by the program's composition root.
 */
export interface Cell<in I, out A, out E = never, out R = never> extends Pipeable {
  readonly [CellTypeId]: CellTypeId
  readonly run: (input: I) => Effect.Effect<A, E, R>
}

/**
 * The type lambda for {@link Cell}, admitting Cell to `Kind` positions.
 */
export interface TypeLambda extends HKTTypeLambda {
  readonly type: Cell<this['In'], this['Target'], this['Out2'], this['Out1']>
}

/**
 * A fully-applied {@link Kind} for Cell: `Kind<I, E, R, A>` is `Cell<I, A, E, R>`.
 */
export type Kind<I, E, R, A> = HKTKind<TypeLambda, I, E, R, A>

/**
 * The function shape a Cell publishes, read off the Cell type itself. Use it to type a
 * capability parameter or a callback that hands a Cell's run to a shell:
 * `Run<I, A, E, R>` is `Cell<I, A, E, R>['run']`.
 */
export type Run<I, A, E, R> = Cell<I, A, E, R>['run']

const make = <I, A, E, R>(run: (input: I) => Effect.Effect<A, E, R>): Cell<I, A, E, R> => ({
  [CellTypeId]: CellTypeId,
  run,
  ...Prototype,
})
/**
 * A constant response for any input; the error and service channels are never.
 */
export const succeed = <A>(response: A): Cell<unknown, A, never, never> => make(() => Effect.succeed(response))

/**
 * A constant infrastructure failure for any input.
 */
export const fail = <E>(error: E): Cell<unknown, never, E, never> => make(() => Effect.fail(error))

/**
 * The lifted effect's response, failure, and services carried for any input.
 */
export const fromEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Cell<unknown, A, E, R> => make(() => effect)

/**
 * The thunked cell built afresh on each run; construction never happens at wrap time.
 */
export const suspend = <I, A, E, R>(thunk: () => Cell<I, A, E, R>): Cell<I, A, E, R> =>
  make((input) => Effect.suspend(() => thunk().run(input)))

/**
 * The response is the input; the identity for `andThen`.
 */
export const id = <I>(): Cell<I, I, never, never> => make((input) => Effect.succeed(input))
/**
 * Transforms the Cell's response.
 */
export const map: {
  <A, B>(f: (a: A) => B): <I, E, R>(self: Cell<I, A, E, R>) => Cell<I, B, E, R>
  <I, A, E, R, B>(self: Cell<I, A, E, R>, f: (a: A) => B): Cell<I, B, E, R>
} = dual(
  2,
  <I, A, E, R, B>(self: Cell<I, A, E, R>, f: (a: A) => B): Cell<I, B, E, R> =>
    make((input) => Effect.map(self.run(input), f)),
)

/**
 * Transforms the Cell's input.
 */
export const mapInput: {
  <I0, I>(f: (input: I0) => I): <A, E, R>(self: Cell<I, A, E, R>) => Cell<I0, A, E, R>
  <I0, I, A, E, R>(self: Cell<I, A, E, R>, f: (input: I0) => I): Cell<I0, A, E, R>
} = dual(
  2,
  <I0, I, A, E, R>(self: Cell<I, A, E, R>, f: (input: I0) => I): Cell<I0, A, E, R> =>
    make((input: I0) => self.run(f(input))),
)

/**
 * Feeds this Cell's response to the next Cell as its input. The error and service channels
 * union.
 */
export const andThen: {
  <B, E2, R2>(
    that: Cell<never, B, E2, R2>,
  ): <I, A, E, R>(self: Cell<I, A, E, R>) => Cell<I, B, E | E2, R | R2>
  <I, A, E, R, B, E2, R2>(
    self: Cell<I, A, E, R>,
    that: Cell<A, B, E2, R2>,
  ): Cell<I, B, E | E2, R | R2>
  <A, B, E2, R2>(
    f: (response: A) => Cell<A, B, E2, R2>,
  ): <I, E, R>(self: Cell<I, A, E, R>) => Cell<I, B, E | E2, R | R2>
  <I, A, E, R, B, E2, R2>(
    self: Cell<I, A, E, R>,
    f: (response: A) => Cell<A, B, E2, R2>,
  ): Cell<I, B, E | E2, R | R2>
} = dual(
  2,
  <I, A, E, R, B, E2, R2>(
    self: Cell<I, A, E, R>,
    that: Cell<A, B, E2, R2> | ((response: A) => Cell<A, B, E2, R2>),
  ): Cell<I, B, E | E2, R | R2> =>
    make((input) =>
      Effect.flatMap(
        self.run(input),
        (response) => {
          if (typeof that === 'function') {
            return that(response).run(response)
          }
          return that.run(response)
        },
      )
    ),
)

/**
 * Runs both Cells against the same input and tuples the responses. Fails fast: when one
 * side refuses, the other's write never runs.
 */
export const zip: {
  <I, B, E2, R2>(
    that: Cell<I, B, E2, R2>,
  ): <A, E, R>(self: Cell<I, A, E, R>) => Cell<I, readonly [A, B], E | E2, R | R2>
  <I, A, E, R, B, E2, R2>(
    self: Cell<I, A, E, R>,
    that: Cell<I, B, E2, R2>,
  ): Cell<I, readonly [A, B], E | E2, R | R2>
} = dual(
  2,
  <I, A, E, R, B, E2, R2>(
    self: Cell<I, A, E, R>,
    that: Cell<I, B, E2, R2>,
  ): Cell<I, readonly [A, B], E | E2, R | R2> =>
    make((input) => Effect.zipWith(self.run(input), that.run(input), (a, b): readonly [A, B] => [a, b])),
)

/**
 * Runs the inner Cell on the value this Cell read, yielding `Option.none` when it read none.
 * A skip is an absence, never a refusal; the error and service channels union.
 */
export const gate: {
  <Raw, A, E2, R2>(
    inner: Cell<Raw, A, E2, R2>,
  ): <I, E, R>(self: Cell<I, Option.Option<Raw>, E, R>) => Cell<I, Option.Option<A>, E | E2, R | R2>
  <I, Raw, E, R, A, E2, R2>(
    self: Cell<I, Option.Option<Raw>, E, R>,
    inner: Cell<Raw, A, E2, R2>,
  ): Cell<I, Option.Option<A>, E | E2, R | R2>
} = dual(
  2,
  <I, Raw, E, R, A, E2, R2>(
    self: Cell<I, Option.Option<Raw>, E, R>,
    inner: Cell<Raw, A, E2, R2>,
  ): Cell<I, Option.Option<A>, E | E2, R | R2> =>
    make<I, Option.Option<A>, E | E2, R | R2>((input) =>
      Effect.flatMap(self.run(input), (read): Effect.Effect<Option.Option<A>, E2, R2> =>
        Option.match(read, {
          onNone: () => Effect.succeed(Option.none<A>()),
          onSome: (raw) => Effect.map(inner.run(raw), Option.some),
        }))
    ),
)

/**
 * Runs the Cell once per item, in order, and folds the responses into one value. The error
 * and service channels are unchanged; the first refusal ends the run.
 */
export const collect: {
  <I, A, E, R, B>(
    fold: (responses: readonly A[]) => B,
  ): (self: Cell<I, A, E, R>) => Cell<readonly I[], B, E, R>
  <I, A, E, R, B>(self: Cell<I, A, E, R>, fold: (responses: readonly A[]) => B): Cell<readonly I[], B, E, R>
} = dual(
  2,
  <I, A, E, R, B>(
    self: Cell<I, A, E, R>,
    fold: (responses: readonly A[]) => B,
  ): Cell<readonly I[], B, E, R> =>
    make<readonly I[], B, E, R>((items) =>
      Effect.map(
        Effect.forEach(items, (item) => self.run(item)),
        (responses) => fold(responses),
      )
    ),
)

/**
 * Runs the Cell once per item, in order, and folds every outcome — each a `Result.Result` —
 * into one value. Unlike {@link collect}, no refusal ends the run: every item is attempted
 * and its failure travels to the fold.
 */
export const collectAll: {
  <I, A, E, R, B>(
    fold: (results: readonly Result.Result<A, E>[]) => B,
  ): (self: Cell<I, A, E, R>) => Cell<readonly I[], B, never, R>
  <I, A, E, R, B>(
    self: Cell<I, A, E, R>,
    fold: (results: readonly Result.Result<A, E>[]) => B,
  ): Cell<readonly I[], B, never, R>
} = dual(
  2,
  <I, A, E, R, B>(
    self: Cell<I, A, E, R>,
    fold: (results: readonly Result.Result<A, E>[]) => B,
  ): Cell<readonly I[], B, never, R> =>
    make<readonly I[], B, never, R>((items) =>
      Effect.map(
        Effect.forEach(items, (item) => Effect.result(self.run(item))),
        (results) => fold(results),
      )
    ),
)

/**
 * Provides a Layer to the Cell, eliminating the services the layer builds from `R`. This is
 * the one composition-root elimination; the resulting Cell still demands the layer's input
 * services. A missing provide is a compile error at the run site.
 */
export const provide: {
  <RIn, LE, ROut>(
    layer: Layer<ROut, LE, RIn>,
  ): <I, A, E, R>(self: Cell<I, A, E, R>) => Cell<I, A, E | LE, RIn | Exclude<R, ROut>>
  <I, A, E, R, RIn, LE, ROut>(
    self: Cell<I, A, E, R>,
    layer: Layer<ROut, LE, RIn>,
  ): Cell<I, A, E | LE, RIn | Exclude<R, ROut>>
} = dual(
  2,
  <I, A, E, R, RIn, LE, ROut>(
    self: Cell<I, A, E, R>,
    layer: Layer<ROut, LE, RIn>,
  ): Cell<I, A, E | LE, RIn | Exclude<R, ROut>> => make((input) => Effect.provide(self.run(input), layer)),
)

/**
 * Remaps the Cell's infrastructure failure.
 */
export const mapError: {
  <E, F>(f: (error: E) => F): <I, A, R>(self: Cell<I, A, E, R>) => Cell<I, A, F, R>
  <I, A, E, R, F>(self: Cell<I, A, E, R>, f: (error: E) => F): Cell<I, A, F, R>
} = dual(
  2,
  <I, A, E, R, F>(self: Cell<I, A, E, R>, f: (error: E) => F): Cell<I, A, F, R> =>
    make((input) => Effect.mapError(self.run(input), f)),
)

/**
 * Recovers from the Cell's infrastructure failure by running the fallback cell for the
 * same input. The fallback answers the same response, so the error narrows to the
 * fallback's. A decide refusal is success-channel data by the time run answers, so it
 * passes through untouched and the fallback never runs for it.
 */
export const orElse: {
  <I, A, E2, R2>(fallback: Cell<I, A, E2, R2>): <E, R>(self: Cell<I, A, E, R>) => Cell<I, A, E2, R | R2>
  <I, A, E, R, E2, R2>(self: Cell<I, A, E, R>, fallback: Cell<I, A, E2, R2>): Cell<I, A, E2, R | R2>
} = dual(
  2,
  <I, A, E, R, E2, R2>(self: Cell<I, A, E, R>, fallback: Cell<I, A, E2, R2>): Cell<I, A, E2, R | R2> =>
    make((input) =>
      Effect.matchEffect(self.run(input), {
        onFailure: () => fallback.run(input),
        onSuccess: (value) => Effect.succeed(value),
      })
    ),
)

/**
 * Observes the Cell's response with an effect and preserves it. The observer never runs
 * on an infrastructure failure.
 */
export const tap: {
  <A, E2, R2>(
    f: (response: A) => Effect.Effect<unknown, E2, R2>,
  ): <I, E, R>(self: Cell<I, A, E, R>) => Cell<I, A, E | E2, R | R2>
  <I, A, E, R, E2, R2>(
    self: Cell<I, A, E, R>,
    f: (response: A) => Effect.Effect<unknown, E2, R2>,
  ): Cell<I, A, E | E2, R | R2>
} = dual(
  2,
  <I, A, E, R, E2, R2>(
    self: Cell<I, A, E, R>,
    f: (response: A) => Effect.Effect<unknown, E2, R2>,
  ): Cell<I, A, E | E2, R | R2> => make((input) => Effect.tap(self.run(input), f)),
)

/**
 * Threads the response through the function's cell on the original input. Both cells
 * observe the identical input; the error and service channels union.
 */
export const flatMap: {
  <I, A, B, E2, R2>(
    f: (response: A) => Cell<I, B, E2, R2>,
  ): <E, R>(self: Cell<I, A, E, R>) => Cell<I, B, E | E2, R | R2>
  <I, A, E, R, B, E2, R2>(
    self: Cell<I, A, E, R>,
    f: (response: A) => Cell<I, B, E2, R2>,
  ): Cell<I, B, E | E2, R | R2>
} = dual(
  2,
  <I, A, E, R, B, E2, R2>(
    self: Cell<I, A, E, R>,
    f: (response: A) => Cell<I, B, E2, R2>,
  ): Cell<I, B, E | E2, R | R2> =>
    make((input) => Effect.flatMap(self.run(input), (response) => f(response).run(input))),
)

/**
 * Combines two cells over one input with the given function. Fail-fast: when one side
 * refuses, the run fails and the error and service channels union.
 */
export const zipWith: {
  <I, B, E2, R2, A, C>(
    that: Cell<I, B, E2, R2>,
    f: (a: A, b: B) => C,
  ): <E, R>(self: Cell<I, A, E, R>) => Cell<I, C, E | E2, R | R2>
  <I, A, E, R, B, E2, R2, C>(
    self: Cell<I, A, E, R>,
    that: Cell<I, B, E2, R2>,
    f: (a: A, b: B) => C,
  ): Cell<I, C, E | E2, R | R2>
} = dual(
  3,
  <I, A, E, R, B, E2, R2, C>(
    self: Cell<I, A, E, R>,
    that: Cell<I, B, E2, R2>,
    f: (a: A, b: B) => C,
  ): Cell<I, C, E | E2, R | R2> => make((input) => Effect.zipWith(self.run(input), that.run(input), f)),
)

/**
 * Folds the run outcome with pure handlers. A decide refusal is success-channel data by
 * the time run answers, so it reaches the success arm; the resulting error channel is
 * never.
 */
export const match: {
  <A, E, B, C>(
    options: {
      readonly onFailure: (error: E) => B
      readonly onSuccess: (value: A) => C
    },
  ): <I, R>(self: Cell<I, A, E, R>) => Cell<I, B | C, never, R>
  <I, A, E, R, B, C>(
    self: Cell<I, A, E, R>,
    options: {
      readonly onFailure: (error: E) => B
      readonly onSuccess: (value: A) => C
    },
  ): Cell<I, B | C, never, R>
} = dual(
  2,
  <I, A, E, R, B, C>(
    self: Cell<I, A, E, R>,
    options: {
      readonly onFailure: (error: E) => B
      readonly onSuccess: (value: A) => C
    },
  ): Cell<I, B | C, never, R> => make((input) => Effect.match(self.run(input), options)),
)

/**
 * The local no-infer marker the Do chain overloads use so the accumulator
 * stays fixed while the next field infers.
 */
type NoInfer<A> = [A][A extends unknown ? 0 : never]

/**
 * The empty accumulator cell a Do chain starts from.
 */
export const Do: Kind<unknown, never, never, {}> = make(() => Effect.succeed({}))
/**
 * Adds a named field to the Do accumulator by running the cell the function
 * builds from the accumulated scope. Both cells observe the identical input,
 * so a bind demanding another input is a compile error; the error and service
 * channels union. A failing cell short-circuits the rest of the chain.
 */
export const bind: {
  <N extends string, A extends object, I, E2, R2, B>(
    name: Exclude<N, keyof A>,
    f: (a: NoInfer<A>) => Kind<I, E2, R2, B>,
  ): <E, R>(self: Kind<I, E, R, A>) => Kind<I, E | E2, R | R2, A & Record<N, B>>
  <I, A extends object, E, R, N extends string, E2, R2, B>(
    self: Kind<I, E, R, A>,
    name: Exclude<N, keyof A>,
    f: (a: NoInfer<A>) => Kind<I, E2, R2, B>,
  ): Kind<I, E | E2, R | R2, A & Record<N, B>>
} = dual(
  3,
  <I, A extends object, E, R, N extends string, E2, R2, B>(
    self: Kind<I, E, R, A>,
    name: Exclude<N, keyof A>,
    f: (a: NoInfer<A>) => Kind<I, E2, R2, B>,
  ) => flatMap(self, (a) => map(f(a), (b) => ({ ...a, [name]: b }))),
)

/**
 * Wraps the cell's response into a named field, starting a Do chain from an
 * existing cell.
 */
export const bindTo: {
  <N extends string, A, E, R>(
    name: N,
  ): <I>(self: Kind<I, E, R, A>) => Kind<I, E, R, Record<N, A>>
  <I, A, E, R, N extends string>(
    self: Kind<I, E, R, A>,
    name: N,
  ): Kind<I, E, R, Record<N, A>>
} = dual(
  2,
  <I, A, E, R, N extends string>(self: Kind<I, E, R, A>, name: N) => map(self, (a) => ({ [name]: a })),
)

/**
 * Adds a named field to the Do accumulator by computing a pure value from the
 * accumulated scope. The input, error, and service channels pass through.
 */
const let_: {
  <N extends string, A extends object, B>(
    name: Exclude<N, keyof A>,
    f: (a: NoInfer<A>) => B,
  ): <I, E, R>(self: Kind<I, E, R, A>) => Kind<I, E, R, A & Record<N, B>>
  <I, A extends object, E, R, N extends string, B>(
    self: Kind<I, E, R, A>,
    name: Exclude<N, keyof A>,
    f: (a: NoInfer<A>) => B,
  ): Kind<I, E, R, A & Record<N, B>>
} = dual(
  3,
  <I, A extends object, E, R, N extends string, B>(
    self: Kind<I, E, R, A>,
    name: Exclude<N, keyof A>,
    f: (a: NoInfer<A>) => B,
  ) => map(self, (a) => ({ ...a, [name]: f(a) })),
)

export { let_ as let }
