import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import type { Kind as HKTKind, TypeLambda as HKTTypeLambda } from 'effect/HKT'
import type { Layer } from 'effect/Layer'
import * as Result from 'effect/Result'
import { DESCRIPTION_MODULE, IO_CELLS, type IoCellClassification, type PhaseName } from './Facts.js'
import type { Policy } from './Policy.js'
import { type WorkflowBrand } from './Workflow.js'

export { DESCRIPTION_MODULE, IO_CELLS, type IoCellClassification, type PhaseName }

/**
 * The nominal brand every `Cell` carries. `Cell.layer` is the only door that applies it.
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
export interface Cell<in I, out A, out E = never, out R = never> {
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
})

interface LayerCore<I, Raw, RE, RR, Dec, DE, Resp, WE, WR> {
  readonly read: (command: I) => Effect.Effect<Raw, RE, RR>
  readonly decide: ((decoded: Raw) => Result.Result<Dec, DE>) & WorkflowBrand
  readonly write: (output: Result.Result<Dec, DE>, raw: Raw) => Effect.Effect<Resp, WE, WR>
}

interface LayerShortSpec<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>
  extends LayerCore<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>
{
  readonly decode?: never
  readonly encode?: never
}

interface LayerLongSpec<I, Raw, RE, RR, Dcd, DecE, Dec, DE, Out, Resp, WE, WR>
  extends Omit<LayerCore<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>, 'decide' | 'write'>
{
  readonly decode: (raw: Raw) => Result.Result<Dcd, DecE>
  readonly decide: ((decoded: Dcd) => Result.Result<Dec, DE>) & WorkflowBrand
  readonly encode: (outcome: Result.Result<Dec, DE>) => Out
  readonly write: (output: Out, raw: Raw) => Effect.Effect<Resp, WE, WR>
}

/**
 * The interpreter. Order is the text: read, then decode, then decide, then encode, then
 * write. The `E` channel is the sandwich's truth — read, decode, and write failures;
 * a decide refusal is the outcome the encode and write receive, not a failure.
 */
const layerRunner = <I, Raw, RE, RR, Dcd, DecE, Dec, DE, Out, Resp, WE, WR>(
  spec:
    | LayerCore<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>
    | LayerLongSpec<I, Raw, RE, RR, Dcd, DecE, Dec, DE, Out, Resp, WE, WR>,
): (input: I) => Effect.Effect<Resp, RE | DecE | WE, RR | WR> => {
  if ('decode' in spec && 'encode' in spec) {
    return (input) =>
      Effect.gen(function*() {
        const raw = yield* spec.read(input)
        const decoded = yield* Result.match(spec.decode(raw), {
          onFailure: Effect.fail,
          onSuccess: Effect.succeed,
        })
        const outcome = spec.decide(decoded)
        return yield* spec.write(spec.encode(outcome), raw)
      })
  }
  return (input) =>
    Effect.gen(function*() {
      const raw = yield* spec.read(input)
      const outcome = spec.decide(raw)
      return yield* spec.write(outcome, raw)
    })
}

/**
 * Builds a Cell from one sandwich.
 *
 * Short form — `read` produces the value `decide` rules on, and the decide outcome is what
 * `write` receives:
 *
 * ```ts
 * import { Cell, Workflow } from '@systemfsoftware/effect-cell-types'
 * import { Effect, Result } from 'effect'
 *
 * declare const decideAdmission: Workflow<CliArgs, Verdict, Refusal>
 * declare class CliArgs { readonly target: string }
 * declare class Verdict { readonly ok: boolean }
 * declare class Refusal { readonly _tag: 'Refused' }
 *
 * const cell = Cell.layer({
 *   read: (args: CliArgs) => Effect.succeed(args),
 *   decide: decideAdmission,
 *   write: (outcome: Result.Result<Verdict, Refusal>, raw: CliArgs) => Effect.void,
 * })
 * ```
 *
 * Long form — `decode` and `encode` adapt each side of `decide`; both are required together,
 * and a spec carrying one without the other fails inference.
 */
export function layer<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>(
  spec: LayerShortSpec<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>,
): Cell<I, Resp, RE | WE, RR | WR>
export function layer<I, Raw, RE, RR, Dcd, DecE, Dec, DE, Out, Resp, WE, WR>(
  spec: LayerLongSpec<I, Raw, RE, RR, Dcd, DecE, Dec, DE, Out, Resp, WE, WR>,
): Cell<I, Resp, RE | DecE | WE, RR | WR>
export function layer<I, Raw, RE, RR, Dcd, DecE, Dec, DE, Out, Resp, WE, WR>(
  spec:
    | LayerCore<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>
    | LayerLongSpec<I, Raw, RE, RR, Dcd, DecE, Dec, DE, Out, Resp, WE, WR>,
): Cell<I, Resp, RE | DecE | WE, RR | WR> {
  return make(layerRunner(spec))
}
export const run: {
  <I>(input: I): <A, E, R>(self: Cell<I, A, E, R>) => Effect.Effect<A, E, R>
  <I, A, E, R>(self: Cell<I, A, E, R>, input: I): Effect.Effect<A, E, R>
} = dual(
  2,
  <I, A, E, R>(self: Cell<I, A, E, R>, input: I): Effect.Effect<A, E, R> => self.run(input),
)

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
} = dual(
  2,
  <I, A, E, R, B, E2, R2>(
    self: Cell<I, A, E, R>,
    that: Cell<A, B, E2, R2>,
  ): Cell<I, B, E | E2, R | R2> => make((input) => Effect.flatMap(self.run(input), (response) => that.run(response))),
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
 * Wraps the Cell's run in a `Policy` — retry, timeout, and their kin — preserving every
 * channel.
 */
export const withPolicy: {
  <A, E, R>(
    policy: Policy<A, E, R>,
  ): <I>(self: Cell<I, A, E, R>) => Cell<I, A, E, R>
  <I, A, E, R>(
    self: Cell<I, A, E, R>,
    policy: Policy<A, E, R>,
  ): Cell<I, A, E, R>
} = dual(
  2,
  <I, A, E, R>(
    self: Cell<I, A, E, R>,
    policy: Policy<A, E, R>,
  ): Cell<I, A, E, R> => make((input) => policy(self.run(input))),
)

/**
 * The facts the lint plugin judges a spec body by, as a const table. The order the
 * interpreter runs is the text of {@link layerRunner}; the table states only what a
 * rule cannot read off a type: which phases are pure, and what counts as I/O.
 */
export interface Vocabulary {
  readonly module: typeof DESCRIPTION_MODULE
  readonly ioCells: IoCellClassification
  readonly byKind: { readonly pure: readonly PhaseName[] }
  readonly composer: 'layer'
}

export const vocabulary: Vocabulary = {
  module: DESCRIPTION_MODULE,
  ioCells: IO_CELLS,
  byKind: { pure: ['decode', 'decide', 'encode'] },
  composer: 'layer',
}
