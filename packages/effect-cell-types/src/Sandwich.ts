/// <reference types="vitest/importMeta" />
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Metric from 'effect/Metric'
import { Prototype } from 'effect/Pipeable'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import type { AnySpan, Span } from 'effect/Tracer'
import { type Cell, CellTypeId } from './Cell.js'
export type { Cell } from './Cell.js'
import type { CommandSchema, InstrumentationMap, WorkflowBrand } from './Workflow.js'
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

/** The class-side declaration the runner reads: the field→attribute-key map a span may carry. */
type InstrumentedSchema = CommandSchema & { readonly [InstrumentationBrand]: InstrumentationMap }
type BrandHolder = { readonly [InstrumentationBrand]: InstrumentationMap }

const entriesOf = (map: InstrumentationMap): ReadonlyArray<readonly [string, string]> => Object.entries(map)

const isMapDeclaration = (value: unknown): value is InstrumentationMap => typeof value === 'object' && value !== null

const annotateFields = <C>(schema: InstrumentedSchema | undefined, command: C): Effect.Effect<void> =>
  schema === undefined
    ? Effect.void
    : Effect.forEach(
      entriesOf(schema[InstrumentationBrand]),
      ([field, attribute]) => Effect.annotateCurrentSpan(attribute, Reflect.get(Object(command), field)),
      { discard: true },
    )

const tagOf = <T>(value: T): string => String(Reflect.get(Object(value), '_tag'))

const holdsBrand = (holder: unknown): holder is BrandHolder =>
  isMapDeclaration(Reflect.get(Object(holder), InstrumentationBrand))

const hasHeldBrand = (value: unknown): value is { constructor: BrandHolder } =>
  holdsBrand(Reflect.get(Object(value), 'constructor'))

const heldMap = <T>(value: T): InstrumentationMap => hasHeldBrand(value) ? value.constructor[InstrumentationBrand] : {}

const annotateHeld = <T>(value: T): Effect.Effect<void> =>
  Effect.forEach(
    entriesOf(heldMap(value)),
    ([field, attribute]) => Effect.annotateCurrentSpan(attribute, Reflect.get(Object(value), field)),
    { discard: true },
  )

const annotateTagged = <T>(label: string, value: T): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* Effect.annotateCurrentSpan(label, tagOf(value))
    yield* annotateHeld(value)
  })

const annotateOutcome = <D, E>(name: string, outcome: Result.Result<D, E>): Effect.Effect<void> =>
  Result.match(outcome, {
    onSuccess: (decision) => annotateTagged(`app.${name}.decision`, decision),
    onFailure: (refusal) => annotateTagged(`app.${name}.failure`, refusal),
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
                  yield* annotateOutcome(name, outcome)
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
              yield* annotateOutcome(name, outcome)
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

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published module graph.
  const { it } = await import('@effect/vitest')
  const { Array: Arr, Effect, Match, Option, Predicate, Result, Schema } = await import('effect')
  const { make } = await import('./Workflow.js')

  const Operation = 'span.command.law'
  const LawDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/SpanLaw/Decision')

  class LawCommand extends Schema.TaggedClass<LawCommand>()('LawCommand', {
    length: Schema.Int,
  }) {
    static readonly [InstrumentationBrand] = { length: 'tests.span.length' } as const
  }

  class LawAdmitted extends Schema.TaggedClass<LawAdmitted>()('LawAdmitted', {
    length: Schema.Int,
  }) {
    readonly [LawDecisionTypeId] = LawDecisionTypeId
    static readonly [InstrumentationBrand] = { length: 'tests.span.admitted.length' } as const
  }

  class LawRefused extends Schema.TaggedClass<LawRefused>()('LawRefused', {
    why: Schema.String,
  }) {
    readonly [LawDecisionTypeId] = LawDecisionTypeId
  }

  class LawMalformed extends Schema.TaggedError<LawMalformed>()('LawMalformed', {
    length: Schema.Int,
  }) {
    readonly [LawDecisionTypeId] = LawDecisionTypeId
  }

  const decideLawCommand = make(
    LawCommand,
    (command): Result.Result<LawAdmitted | LawRefused, LawMalformed> =>
      Match.value(command.length < 0).pipe(
        Match.when(true, () => Result.fail(new LawMalformed({ length: command.length }))),
        Match.when(false, () =>
          Match.value(command.length > 3).pipe(
            Match.when(true, () => Result.succeed(new LawAdmitted({ length: command.length }))),
            Match.when(false, () => Result.succeed(new LawRefused({ why: 'too short' }))),
            Match.exhaustive,
          )),
        Match.exhaustive,
      ),
  )

  const cell = named(Operation)((command: LawCommand) => Effect.succeed(command))
    .decide(decideLawCommand)
    .write((outcome, raw) =>
      Effect.map(Effect.currentSpan, (span) =>
        Option.some({
          outcome,
          raw,
          operation: Option.filter(span.parent, isLocalSpan),
        }))
    )

  const isLocalSpan = (parent: AnySpan): parent is Span => Predicate.hasProperty(parent, 'attributes')

  const AdmittedLength = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(3)))
  const RefusedLength = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: -100, maximum: -1 })))
  const holds = (verdicts: ReadonlyArray<boolean>): boolean => Arr.every(verdicts, (verdict) => verdict)

  it.effect.prop('∀c_Span_=Named', [AdmittedLength], ([length]) =>
    Effect.gen(function*() {
      const observed = Option.getOrThrow(yield* cell.run(new LawCommand({ length })))
      return Option.getOrThrow(observed.operation).name === Operation
    }))

  it.effect.prop('∀c_Span_=Mapped', [Schema.Int], ([length]) =>
    Effect.gen(function*() {
      const observed = Option.getOrThrow(yield* cell.run(new LawCommand({ length })))
      const attributes = Option.getOrThrow(observed.operation).attributes
      return holds([
        attributes.get('tests.span.length') === length,
        !attributes.has('length'),
      ])
    }))

  it.effect.prop('∀c_Span_=Decided', [AdmittedLength], ([length]) =>
    Effect.gen(function*() {
      const observed = Option.getOrThrow(yield* cell.run(new LawCommand({ length })))
      const attributes = Option.getOrThrow(observed.operation).attributes
      return holds([
        attributes.get('app.span.command.law.decision') === tagOf(Result.getOrThrow(observed.outcome)),
        attributes.get('tests.span.admitted.length') === length,
        !attributes.has('decision'),
      ])
    }))

  it.effect.prop('∀c_Span_=Refused', [RefusedLength], ([length]) =>
    Effect.gen(function*() {
      const observed = Option.getOrThrow(yield* cell.run(new LawCommand({ length })))
      const attributes = Option.getOrThrow(observed.operation).attributes
      return holds([
        attributes.get('app.span.command.law.failure') === 'LawMalformed',
        !attributes.has('failure'),
      ])
    }))
}
