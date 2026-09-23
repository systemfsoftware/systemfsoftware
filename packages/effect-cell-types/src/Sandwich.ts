import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Metric from 'effect/Metric'
import { Prototype } from 'effect/Pipeable'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { type Cell, CellTypeId } from './Cell.js'
import { CommandRejected } from './CommandRejected.schema.js'
import type { DecisionSchema, InstrumentedCommandSchema, WorkflowBrand, WorkflowSchemas } from './Workflow.js'
import { InstrumentationBrand, WorkflowSchemasKey } from './Workflow.js'
export type { Cell } from './Cell.js'
export { CommandRejected } from './CommandRejected.schema.js'

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

/** The phases a cell executes, in the order it executes them. */
export type Phases = readonly ['read', 'decode', 'decide', 'encode', 'write']

type Settle = (resultClass: ResultClass) => Effect.Effect<void>

const annotateFields = <C>(schema: InstrumentedCommandSchema, command: C): Effect.Effect<void> =>
  Effect.forEach(
    schema[InstrumentationBrand],
    (key) => Effect.annotateCurrentSpan(key, Reflect.get(Object(command), key)),
    { discard: true },
  )

const tagOf = <T>(value: T): string => String(Reflect.get(Object(value), '_tag'))

const holdsBrand = (holder: unknown): holder is BrandHolder =>
  Array.isArray(Reflect.get(Object(holder), InstrumentationBrand))

const hasHeldBrand = (value: unknown): value is { constructor: BrandHolder } =>
  holdsBrand(Reflect.get(Object(value), 'constructor'))

type BrandHolder = { readonly [InstrumentationBrand]: ReadonlyArray<string> }

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

const okOrRefusal = <D, E>(outcome: Result.Result<D, E>): ResultClass =>
  Result.isSuccess(outcome) ? 'success' : 'failure'

/** A shell failure is infrastructure even after a refusal; the refusal label is kept only when the run completes. */
const recordedClass = (isSuccess: boolean, settled: ResultClass): ResultClass => isSuccess ? settled : 'infrastructure'

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
  core: (settle: Settle) => Effect.Effect<A, E, R>,
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

const boundariesFor = (options: NamedCellOptions | undefined): ReadonlyArray<number> =>
  options === undefined ? DEFAULT_DURATION_BOUNDARIES : options.boundaries

const histogramFor = (
  name: string,
  options: NamedCellOptions | undefined,
): Metric.Metric<number, Metric.HistogramState> =>
  Metric.histogram(`app.${name}.duration`, { boundaries: boundariesFor(options) })

/** The encoded variants a decision carries: the element variants of an event list, or the variants themselves. */
type DecisionElements<Decision extends DecisionSchema> = Decision['Encoded'] extends ReadonlyArray<infer Element>
  ? Element
  : Decision['Encoded']

type DecisionIsList<Decision extends DecisionSchema> = Decision['Encoded'] extends ReadonlyArray<infer _Element> ? true
  : false

/** An exclusive decision answers with the handler result; an event list answers with one result per event. */
type CellResponse<Decision extends DecisionSchema, A> = DecisionIsList<Decision> extends true ? ReadonlyArray<A>
  : A

/** Every encoded variant a write must answer: decision variants, error variants, and the rejection envelope. */
type EncodedVariants<Decision extends DecisionSchema, Error extends DecisionSchema> =
  | DecisionElements<Decision>
  | Error['Encoded']
  | CommandRejected

/** The `_tag`s a variant union carries, read off a record carrier so no tag member is written by hand. */
type TagsOf<Variants> = Variants extends Record<'_tag', infer Tag extends PropertyKey> ? Tag : never

/** The variant of a union whose `_tag` is the given tag. */
type VariantFor<Variants, Tag extends PropertyKey> = Extract<Variants, Record<'_tag', Tag>>

/**
 * The handlers a write must carry, keyed by every encoded decision tag, every encoded error
 * tag, and `CommandRejected`. Each handler receives its encoded value and the encoded command
 * `read` returned.
 */
export type Handlers<
  Decision extends DecisionSchema,
  Error extends DecisionSchema,
  Raw,
  A,
  WE,
  WR,
> = {
  readonly [Tag in TagsOf<EncodedVariants<Decision, Error>>]: (
    value: VariantFor<EncodedVariants<Decision, Error>, Tag>,
    command: Raw,
  ) => Effect.Effect<A, WE, WR>
}

/** A handler record whose handlers may return any effect; `write` infers the channels from it. */
export type HandlerRecord<
  Decision extends DecisionSchema,
  Error extends DecisionSchema,
  Raw,
  Out = unknown,
> = Handlers<Decision, Error, Raw, Out, Out, Out>

/** Every handler's returned effect, unioned across the record. */
type HandlerOutput<H> = {
  readonly [Tag in keyof H]: H[Tag] extends (value: never, command: never) => infer Out ? Out : never
}[keyof H]

/** The cell a handler record writes: each channel is the union of what the handlers return. */
export type WrittenFrom<I, RE, RR, Decision extends DecisionSchema, H> = WrittenCell<
  I,
  RE,
  RR,
  Decision,
  Effect.Success<HandlerOutput<H>>,
  Effect.Error<HandlerOutput<H>>,
  Effect.Services<HandlerOutput<H>>
>

export interface ReadNotEncoded {
  readonly __CELL_READ_MUST_YIELD_THE_COMMAND_ENCODED__:
    'read must return the command schema\u2019s Encoded form; the library decodes it before decide runs'
}

export interface DecidedChain<
  I,
  Raw,
  RE,
  RR,
  Decision extends DecisionSchema,
  Error extends DecisionSchema,
> {
  readonly 'sentence: must write after decide': true
  write<H extends HandlerRecord<Decision, Error, Raw>>(
    handlers: H,
  ): WrittenFrom<I, RE, RR, Decision, H>
}

export type WrittenCell<
  I,
  RE,
  RR,
  Decision extends DecisionSchema,
  A,
  WE,
  WR,
> = Cell<I, CellResponse<Decision, A>, RE | WE, RR | WR> & { readonly phases: Phases }

export interface ReadChain<I, Raw, RE, RR> {
  readonly 'sentence: must decide after read': true
  decide<
    Command extends InstrumentedCommandSchema,
    Decision extends DecisionSchema,
    Error extends DecisionSchema,
  >(
    workflow:
      & WorkflowBrand<Command, Decision, Error>
      & ((command: Command['Type']) => Result.Result<Decision['Type'], Error['Type']>),
  ): [Raw] extends [Command['Encoded']] ? DecidedChain<I, Raw, RE, RR, Decision, Error> : ReadNotEncoded
}

type HandlerAt<Raw, Value, A, WE, WR> = (value: Value, command: Raw) => Effect.Effect<A, WE, WR>

function assertShape<T>(_value: unknown): asserts _value is T {}

function assertHandlerRecord<Raw, Value, A, WE, WR>(
  _handlers: object,
): asserts _handlers is Readonly<Record<string, HandlerAt<Raw, Value, A, WE, WR>>> {}

const handlerFor = <Raw, Value, A, WE, WR>(handlers: object, tag: string): HandlerAt<Raw, Value, A, WE, WR> => {
  assertHandlerRecord<Raw, Value, A, WE, WR>(handlers)
  const handler: HandlerAt<Raw, Value, A, WE, WR> | undefined = handlers[tag]
  assertShape<HandlerAt<Raw, Value, A, WE, WR>>(handler)
  return handler
}

const dispatchOne = <Raw, Value, A, WE, WR>(
  handlers: object,
  value: Value,
  raw: Raw,
): Effect.Effect<A, WE, WR> => {
  const handler = handlerFor<Raw, Value, A, WE, WR>(handlers, tagOf(value))
  return handler(value, raw)
}

const dispatchAll = <Raw, Value, A, WE, WR>(
  handlers: object,
  values: ReadonlyArray<Value>,
  raw: Raw,
): Effect.Effect<ReadonlyArray<A>, WE, WR> =>
  Effect.forEach(values, (value) => dispatchOne<Raw, Value, A, WE, WR>(handlers, value, raw))

const dispatchEncoded = <Raw, Value, A, WE, WR>(
  handlers: object,
  encoded: Value | ReadonlyArray<Value>,
  raw: Raw,
): Effect.Effect<A | ReadonlyArray<A>, WE, WR> => {
  const isList = (candidate: Value | ReadonlyArray<Value>): candidate is ReadonlyArray<Value> =>
    Array.isArray(candidate)
  return isList(encoded)
    ? dispatchAll<Raw, Value, A, WE, WR>(handlers, encoded, raw)
    : dispatchOne<Raw, Value, A, WE, WR>(handlers, encoded, raw)
}

const writeValue = <Raw, Value, A, WE, WR>(
  name: string,
  handlers: object,
  value: Value | ReadonlyArray<Value>,
  raw: Raw,
): Effect.Effect<A | ReadonlyArray<A>, WE, WR> =>
  Effect.withSpan(dispatchEncoded<Raw, Value, A, WE, WR>(handlers, value, raw), `${name}.write`)

const rejectedRun = <Raw, A, WE, WR>(
  name: string,
  handlers: object,
  raw: Raw,
  issue: string,
  settle: Settle,
): Effect.Effect<A | ReadonlyArray<A>, WE, WR> =>
  Effect.andThen(
    settle('failure'),
    writeValue<Raw, CommandRejected, A, WE, WR>(name, handlers, new CommandRejected({ issue }), raw),
  )

const encodeValue = <S extends Schema.Constraint & { readonly EncodingServices: never }>(
  schema: S,
  value: S['Type'],
): S['Encoded'] => Result.getOrThrow(Schema.encodeResult(schema)(value))

const outcomeRun = <
  Raw,
  A,
  WE,
  WR,
  Command extends InstrumentedCommandSchema,
  Decision extends DecisionSchema,
  Error extends DecisionSchema,
>(
  name: string,
  schemas: WorkflowSchemas<Command, Decision, Error>,
  workflow: (decoded: Command['Type']) => Result.Result<Decision['Type'], Error['Type']>,
  handlers: object,
  decoded: Command['Type'],
  raw: Raw,
  settle: Settle,
): Effect.Effect<A | ReadonlyArray<A>, WE, WR> =>
  Effect.gen(function*() {
    yield* annotateFields(schemas.command, decoded)
    const outcome = workflow(decoded)
    yield* annotateOutcome(outcome)
    yield* settle(okOrRefusal(outcome))
    return yield* Result.match(outcome, {
      onFailure: (refusal) =>
        writeValue<Raw, Error['Encoded'], A, WE, WR>(name, handlers, encodeValue(schemas.error, refusal), raw),
      onSuccess: (decision) =>
        writeValue<Raw, Decision['Encoded'], A, WE, WR>(
          name,
          handlers,
          encodeValue(schemas.decision, decision),
          raw,
        ),
    })
  })

const runOnce = <
  Raw,
  A,
  WE,
  WR,
  Command extends InstrumentedCommandSchema,
  Decision extends DecisionSchema,
  Error extends DecisionSchema,
>(
  name: string,
  schemas: WorkflowSchemas<Command, Decision, Error>,
  workflow: (decoded: Command['Type']) => Result.Result<Decision['Type'], Error['Type']>,
  handlers: object,
  raw: Raw,
  settle: Settle,
): Effect.Effect<A | ReadonlyArray<A>, WE, WR> =>
  Result.match(Schema.decodeUnknownResult(schemas.command)(raw), {
    onFailure: (issue) => rejectedRun<Raw, A, WE, WR>(name, handlers, raw, issue.message, settle),
    onSuccess: (decoded) =>
      outcomeRun<Raw, A, WE, WR, Command, Decision, Error>(name, schemas, workflow, handlers, decoded, raw, settle),
  })

/**
 * Starts a sandwich at a static operation name. The name is the parent span's name and the
 * stem of the duration metric's name; the shell boundaries it opens are the only places a
 * span is created, so an operational cell emits its trace because it was constructed.
 *
 * The chain is `named(name, options?)(read).decide(workflow).write(handlers)`: `read` gathers
 * the command's `Encoded` form, the library decodes it with the workflow's command schema,
 * `decide` rules, the library encodes the decision or error with its schema, and `write`
 * answers through a handler record the compiler holds exhaustive.
 */
export const named = <N extends string>(
  name: ValidOperationName<N>,
  options?: NamedCellOptions,
): <I, Raw, RE, RR>(read: (command: I) => Effect.Effect<Raw, RE, RR>) => ReadChain<I, Raw, RE, RR> => {
  const histogram = histogramFor(name, options)

  return <I, Raw, RE, RR>(read: (command: I) => Effect.Effect<Raw, RE, RR>): ReadChain<I, Raw, RE, RR> => {
    const decide = <
      Command extends InstrumentedCommandSchema,
      Decision extends DecisionSchema,
      Error extends DecisionSchema,
    >(
      workflow:
        & WorkflowBrand<Command, Decision, Error>
        & ((command: Command['Type']) => Result.Result<Decision['Type'], Error['Type']>),
    ): [Raw] extends [Command['Encoded']] ? DecidedChain<I, Raw, RE, RR, Decision, Error> : ReadNotEncoded => {
      const schemas: WorkflowSchemas<Command, Decision, Error> = workflow[WorkflowSchemasKey]
      const write = <H extends HandlerRecord<Decision, Error, Raw>>(
        handlers: H,
      ): WrittenFrom<I, RE, RR, Decision, H> => {
        type A = Effect.Success<HandlerOutput<H>>
        type WE = Effect.Error<HandlerOutput<H>>
        type WR = Effect.Services<HandlerOutput<H>>
        const run = (input: I): Effect.Effect<CellResponse<Decision, A>, RE | WE, RR | WR> =>
          monitoredRun(name, histogram, (settle) =>
            Effect.gen(function*() {
              const raw = yield* Effect.withSpan(read(input), `${name}.read`)
              const settled = yield* runOnce<Raw, A, WE, WR, Command, Decision, Error>(
                name,
                schemas,
                workflow,
                handlers,
                raw,
                settle,
              )
              assertShape<CellResponse<Decision, A>>(settled)
              return settled
            }))
        const cell = {
          [CellTypeId]: CellTypeId,
          run,
          phases: Object.freeze(['read', 'decode', 'decide', 'encode', 'write'] as const),
          ...Prototype,
        }
        assertShape<WrittenCell<I, RE, RR, Decision, A, WE, WR>>(cell)
        return cell
      }
      const chain = { 'sentence: must decide after read': true as const, write }
      type Chain = [Raw] extends [Command['Encoded']] ? DecidedChain<I, Raw, RE, RR, Decision, Error>
        : ReadNotEncoded
      assertShape<Chain>(chain)
      return chain
    }

    return { 'sentence: must decide after read': true as const, decide }
  }
}
