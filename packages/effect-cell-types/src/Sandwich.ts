import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Metric from 'effect/Metric'
import { Prototype } from 'effect/Pipeable'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import { type Cell, CellTypeId } from './Cell.js'
export type { Cell } from './Cell.js'
import type { CommandSchema, WorkflowBrand } from './Workflow.js'
import { InstrumentationBrand, WorkflowSchemasKey } from './Workflow.js'

/** An operation name that carries a unit suffix restates the unit the instrument already states. */
type UnitSuffix = `${string}_${'ms' | 'seconds' | 'bytes'}`

/** The name a named cell accepts: a static literal, with no unit suffix. */
export type ValidOperationName<N extends string> = string extends N
  ? 'operation name must be a static literal string, not a widened string'
  : N extends UnitSuffix ? 'operation name must not carry a unit suffix; the instrument declares its own unit'
  : N

/**
 * The duration buckets a named cell records into by default, in seconds. These are the
 * boundaries the OpenTelemetry semantic conventions suggest for a duration instrument, so a
 * cell that states nothing else lands on the buckets a collector already expects. A caller
 * whose operation lives at a different scale overrides them through
 * {@link NamedCellOptions.boundaries}.
 */
export const DEFAULT_DURATION_BOUNDARIES = [
  0.005,
  0.01,
  0.025,
  0.05,
  0.075,
  0.1,
  0.25,
  0.5,
  0.75,
  1,
  2.5,
  5,
  7.5,
  10,
] as const

export interface NamedCellOptions {
  readonly boundaries: ReadonlyArray<number>
}

/**
 * The only label the runner puts on a duration metric. A caller-declared field stays on the
 * span; a metric label is a closed vocabulary, so the vocabulary is written here.
 */
type ResultClass = 'success' | 'failure' | 'infrastructure'

/** The class-side declaration the runner reads: the fields a span may carry. */
type InstrumentedSchema = CommandSchema & { readonly [InstrumentationBrand]: ReadonlyArray<string> }
type BrandHolder = { readonly [InstrumentationBrand]: ReadonlyArray<string> }

const annotateFields = <C>(schema: InstrumentedSchema | undefined, command: C): Effect.Effect<void> =>
  schema === undefined
    ? Effect.void
    : Effect.forEach(
      schema[InstrumentationBrand],
      (key) => Effect.annotateCurrentSpan(key, Reflect.get(Object(command), key)),
      { discard: true },
    )

const tagOf = <T>(value: T): string => String(Reflect.get(Object(value), '_tag'))

const holdsBrand = (holder: unknown): holder is BrandHolder =>
  Array.isArray(Reflect.get(Object(holder), InstrumentationBrand))

const hasHeldBrand = (value: unknown): value is { constructor: BrandHolder } =>
  holdsBrand(Reflect.get(Object(value), 'constructor'))

const heldKeys = <T>(value: T): ReadonlyArray<string> =>
  hasHeldBrand(value) ? value.constructor[InstrumentationBrand] : []

const annotateHeld = <T>(value: T): Effect.Effect<void> =>
  Effect.forEach(
    heldKeys(value).map((key) => [key, Reflect.get(Object(value), key)] as const),
    ([key, field]) => Effect.annotateCurrentSpan(key, field),
    { discard: true },
  )

const annotateTagged = <T>(label: string, value: T): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* Effect.annotateCurrentSpan(label, tagOf(value))
    yield* annotateHeld(value)
  })

const annotateOutcome = <D, E>(outcome: Result.Result<D, E>): Effect.Effect<void> =>
  Result.match(outcome, {
    onSuccess: (decision) => annotateTagged('decision', decision),
    onFailure: (refusal) => annotateTagged('failure', refusal),
  })

const okOrRefusal = <D, E>(
  outcome: Result.Result<D, E>,
): ResultClass => (Result.isSuccess(outcome) ? 'success' : 'failure')

/** A shell failure is infrastructure even after a refusal; the refusal label is kept only when the run completes. */
const recordedClass = (
  isSuccess: boolean,
  settled: ResultClass,
): ResultClass => (isSuccess ? settled : 'infrastructure')

const recordDuration = (
  histogram: Metric.Metric<number, Metric.HistogramState>,
  startNanos: bigint,
  resultClass: ResultClass,
): Effect.Effect<void> =>
  Effect.gen(function*() {
    const endNanos = yield* Clock.monotonicTimeNanos
    const seconds = Number(endNanos - startNanos) / 1_000_000_000
    yield* Metric.update(Metric.withAttributes(histogram, { result_class: resultClass }), seconds)
  })

/** Runs the shell inside the parent span, records duration on every exit, and closes the span. */
const monitoredRun = <A, E, R>(
  name: string,
  histogram: Metric.Metric<number, Metric.HistogramState>,
  core: (settle: (resultClass: ResultClass) => Effect.Effect<void>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function*() {
    const settled = yield* Ref.make<ResultClass>('infrastructure')
    const startNanos = yield* Clock.monotonicTimeNanos
    const timed = Effect.onExit(core((resultClass) => Ref.set(settled, resultClass)), (exit) =>
      Effect.gen(function*() {
        const resultClass = yield* Ref.get(settled)
        yield* recordDuration(histogram, startNanos, recordedClass(Exit.isSuccess(exit), resultClass))
      }))
    return yield* Effect.withSpan(timed, name)
  })

const boundariesFor = (
  options: NamedCellOptions | undefined,
): ReadonlyArray<number> => (options === undefined ? DEFAULT_DURATION_BOUNDARIES : options.boundaries)

const histogramFor = (
  name: string,
  options: NamedCellOptions | undefined,
): Metric.Metric<number, Metric.HistogramState> =>
  Metric.histogram(`app.${name}.duration`, { boundaries: boundariesFor(options) })

const PurePhaseBrand: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/PurePhase')
type PurePhaseBrand = typeof PurePhaseBrand

export type PurePhase<In, Out, E = never> = ((input: In) => Result.Result<Out, E>) & {
  readonly [PurePhaseBrand]: true
}

export const pure = <In, Out, E = never>(fn: (input: In) => Result.Result<Out, E>): PurePhase<In, Out, E> =>
  Object.assign(fn, { [PurePhaseBrand]: true as const })

export interface ReadChain<I, Raw, RE, RR> {
  readonly 'sentence: must decode or decide after read': true
  decode<Dcd, DecE>(phase: PurePhase<Raw, Dcd, DecE>): DecodedChain<I, Raw, Dcd, RE, DecE, RR>
  decide<Dec, DE>(
    workflow: ((decoded: Raw) => Result.Result<Dec, DE>) & WorkflowBrand,
  ): RawDecidedChain<I, Raw, Dec, DE, RE, RR>
}

export interface DecodedChain<I, Raw, Dcd, RE, DecE, RR> {
  readonly 'sentence: must decide after decode': true
  decide<Dec, DE>(
    workflow: ((decoded: Dcd) => Result.Result<Dec, DE>) & WorkflowBrand,
  ): DecodedDecidedChain<I, Raw, Dec, DE, RE, DecE, RR>
}

export interface RawDecidedChain<I, Raw, Dec, DE, RE, RR> {
  readonly 'sentence: must write after decide on raw chain': true
  write<Resp, WE, WR>(
    run: (output: Result.Result<Dec, DE>, raw: Raw) => Effect.Effect<Resp, WE, WR>,
  ): Cell<I, Resp, RE | WE, RR | WR> & { readonly phases: readonly ['read', 'decide', 'write'] }
}

export interface DecodedDecidedChain<I, Raw, Dec, DE, RE, DecE, RR> {
  readonly 'sentence: must encode after decide on decoded chain': true
  encode<Out>(phase: PurePhase<Result.Result<Dec, DE>, Out, never>): EncodedChain<I, Raw, Out, RE, DecE, RR>
}

export interface EncodedChain<I, Raw, Out, RE, DecE, RR> {
  readonly 'sentence: must write after encode': true
  write<Resp, WE, WR>(
    run: (output: Out, raw: Raw) => Effect.Effect<Resp, WE, WR>,
  ): Cell<I, Resp, RE | DecE | WE, RR | WR> & {
    readonly phases: readonly ['read', 'decode', 'decide', 'encode', 'write']
  }
}

/**
 * Starts a sandwich at a static operation name. The name is the parent span's name and the
 * stem of the duration metric's name; the shell boundaries it opens are the only places a
 * span is created, so an operational cell emits its trace because it was constructed.
 */
export const named = <N extends string>(
  name: ValidOperationName<N>,
  options?: NamedCellOptions,
): <I, Raw, RE, RR>(run: (command: I) => Effect.Effect<Raw, RE, RR>) => ReadChain<I, Raw, RE, RR> => {
  const histogram = histogramFor(name, options)

  return <I, Raw, RE, RR>(run: (command: I) => Effect.Effect<Raw, RE, RR>): ReadChain<I, Raw, RE, RR> => {
    const decode = <Dcd, DecE>(phase: PurePhase<Raw, Dcd, DecE>): DecodedChain<I, Raw, Dcd, RE, DecE, RR> => {
      const decide = <Dec, DE>(
        workflow: ((decoded: Dcd) => Result.Result<Dec, DE>) & WorkflowBrand,
      ): DecodedDecidedChain<I, Raw, Dec, DE, RE, DecE, RR> => {
        const encode = <Out>(
          encodePhase: PurePhase<Result.Result<Dec, DE>, Out, never>,
        ): EncodedChain<I, Raw, Out, RE, DecE, RR> => {
          const write = <Resp, WE, WR>(
            writeRun: (output: Out, raw: Raw) => Effect.Effect<Resp, WE, WR>,
          ): Cell<I, Resp, RE | DecE | WE, RR | WR> & {
            readonly phases: readonly ['read', 'decode', 'decide', 'encode', 'write']
          } => {
            const composed = (input: I): Effect.Effect<Resp, RE | DecE | WE, RR | WR> =>
              monitoredRun(name, histogram, (settle) =>
                Effect.gen(function*() {
                  const raw = yield* Effect.withSpan(run(input), `${name}.read`)
                  const decoded = yield* Result.match(phase(raw), {
                    onFailure: Effect.fail,
                    onSuccess: Effect.succeed,
                  })
                  yield* annotateFields(workflow[WorkflowSchemasKey]?.commandSchema, decoded)
                  const outcome = workflow(decoded)
                  yield* annotateOutcome(outcome)
                  yield* settle(okOrRefusal(outcome))
                  const encoded = Result.getOrThrow(encodePhase(outcome))
                  return yield* Effect.withSpan(writeRun(encoded, raw), `${name}.write`)
                }))
            return {
              [CellTypeId]: CellTypeId,
              run: composed,
              phases: Object.freeze(['read', 'decode', 'decide', 'encode', 'write'] as const),
              ...Prototype,
            }
          }
          return { 'sentence: must write after encode': true, write }
        }
        return { 'sentence: must encode after decide on decoded chain': true, encode }
      }
      return { 'sentence: must decide after decode': true, decide }
    }

    const decide = <Dec, DE>(
      workflow: ((decoded: Raw) => Result.Result<Dec, DE>) & WorkflowBrand,
    ): RawDecidedChain<I, Raw, Dec, DE, RE, RR> => {
      const write = <Resp, WE, WR>(
        writeRun: (output: Result.Result<Dec, DE>, raw: Raw) => Effect.Effect<Resp, WE, WR>,
      ): Cell<I, Resp, RE | WE, RR | WR> & { readonly phases: readonly ['read', 'decide', 'write'] } => {
        const composed = (input: I): Effect.Effect<Resp, RE | WE, RR | WR> =>
          monitoredRun(name, histogram, (settle) =>
            Effect.gen(function*() {
              const raw = yield* Effect.withSpan(run(input), `${name}.read`)
              yield* annotateFields(workflow[WorkflowSchemasKey]?.commandSchema, raw)
              const outcome = workflow(raw)
              yield* annotateOutcome(outcome)
              yield* settle(okOrRefusal(outcome))
              return yield* Effect.withSpan(writeRun(outcome, raw), `${name}.write`)
            }))
        return {
          [CellTypeId]: CellTypeId,
          run: composed,
          phases: Object.freeze(['read', 'decide', 'write'] as const),
          ...Prototype,
        }
      }
      return { 'sentence: must write after decide on raw chain': true, write }
    }

    return { 'sentence: must decode or decide after read': true, decode, decide }
  }
}
