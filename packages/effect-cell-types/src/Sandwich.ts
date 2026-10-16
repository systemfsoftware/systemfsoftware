/// <reference types="vitest/importMeta" />
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { dual } from 'effect/Function'
import * as Metric from 'effect/Metric'
import { Prototype } from 'effect/Pipeable'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import type { AnySpan, Span, SpanOptionsNoTrace } from 'effect/Tracer'
import { type Cell, CellTypeId } from './Cell.js'
import { CommandRejected } from './CommandRejected.schema.js'
import type {
  DecisionSchema,
  InstrumentationMap,
  InstrumentedCommandSchema,
  WorkflowBrand,
  WorkflowSchemas,
} from './Workflow.js'
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

/** The class-side declaration the runner reads: the field→attribute-key map a span may carry. */
type BrandHolder = { readonly [InstrumentationBrand]: InstrumentationMap }

const entriesOf = (map: InstrumentationMap): ReadonlyArray<readonly [string, string]> => Object.entries(map)

const isMapDeclaration = (value: unknown): value is InstrumentationMap => typeof value === 'object' && value !== null

const annotateFields = <C>(schema: InstrumentedCommandSchema, command: C): Effect.Effect<void> =>
  Effect.forEach(
    entriesOf(schema[InstrumentationBrand]),
    ([field, attribute]) => Effect.annotateCurrentSpan(attribute, Reflect.get(Object(command), field)),
    { discard: true },
  )

const tagOf = <T>(value: T): string => String(Reflect.get(Object(value), '_tag'))

type SpanAttribute = NonNullable<SpanOptionsNoTrace['attributes']>[string]

const tagIfPresent = <T>(value: T): string | undefined => {
  const tag: SpanAttribute = Reflect.get(Object(value), '_tag')
  return typeof tag === 'string' ? tag : undefined
}

const declaredFields = <C>(schema: InstrumentedCommandSchema, command: C): Record<string, SpanAttribute> =>
  Object.fromEntries(
    entriesOf(schema[InstrumentationBrand]).map(([field]) => [field, Reflect.get(Object(command), field)] as const),
  )

const taggedMember = <C>(command: C, field: string): ReadonlyArray<readonly [string, string]> => {
  const tag = tagIfPresent(Reflect.get(Object(command), field))
  return tag === undefined ? [] : [[field, tag] as const]
}

const memberTags = <C>(command: C, fields: Schema.Struct.Fields): Record<string, string> =>
  Object.fromEntries(
    Object.keys(fields)
      .filter((field) => field !== '_tag')
      .flatMap((field) => taggedMember(command, field)),
  )

const outcomeTag = <D, E>(outcome: Result.Result<D, E>): string =>
  Result.match(outcome, { onSuccess: tagOf, onFailure: tagOf })

const annotateCellIdentity = (name: string, stacktrace: string, decideStacktrace: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* Effect.annotateCurrentSpan('cell.name', name)
    yield* Effect.annotateCurrentSpan('cell.stacktrace', stacktrace)
    yield* Effect.annotateCurrentSpan('cell.decide_stacktrace', decideStacktrace)
  })

const annotateCommand = <C>(schema: InstrumentedCommandSchema, decoded: C): Effect.Effect<void> =>
  Effect.gen(function*() {
    const commandTag = tagIfPresent(decoded)
    yield* commandTag === undefined ? Effect.void : Effect.annotateCurrentSpan('cell.command_tag', commandTag)
    yield* Effect.annotateCurrentSpan('cell.member_tags', memberTags(decoded, schema.fields))
    yield* Effect.annotateCurrentSpan('cell.declared', declaredFields(schema, decoded))
  })

const annotateCellOutcome = <D, E>(outcome: Result.Result<D, E>): Effect.Effect<void> =>
  Effect.annotateCurrentSpan('cell.outcome', outcomeTag(outcome))

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
  stacktrace: string,
  decideStacktrace: string,
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
    return yield* Effect.withSpan(Effect.andThen(annotateCellIdentity(name, stacktrace, decideStacktrace), timed), name)
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

export interface HandlerForNoVariant {
  readonly __CELL_HANDLER_NAMES_NO_VARIANT__:
    'this handler key names no decision, error, or CommandRejected tag the write can receive'
}

/**
 * The keys of a handler record that answer no variant. A handler for a tag that can never
 * arrive is dead code that reads like a live branch, so each such key is refused by name.
 */
export type ExcessHandlers<H, Decision extends DecisionSchema, Error extends DecisionSchema> = {
  readonly [Key in Exclude<keyof H, TagsOf<EncodedVariants<Decision, Error>>>]: HandlerForNoVariant
}

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
    handlers: H & ExcessHandlers<H, Decision, Error>,
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

const isEventList = <Value>(candidate: Value | ReadonlyArray<Value>): candidate is ReadonlyArray<Value> =>
  Array.isArray(candidate)

const dispatchEncoded = <Raw, Value, A, WE, WR>(
  handlers: object,
  encoded: Value | ReadonlyArray<Value>,
  raw: Raw,
): Effect.Effect<A | ReadonlyArray<A>, WE, WR> =>
  isEventList(encoded)
    ? dispatchAll<Raw, Value, A, WE, WR>(handlers, encoded, raw)
    : dispatchOne<Raw, Value, A, WE, WR>(handlers, encoded, raw)

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
  Effect.gen(function*() {
    yield* settle('failure')
    yield* Effect.annotateCurrentSpan('cell.outcome', 'CommandRejected')
    return yield* writeValue<Raw, CommandRejected, A, WE, WR>(name, handlers, new CommandRejected({ issue }), raw)
  })

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
    yield* annotateCommand(schemas.command, decoded)
    const outcome = workflow(decoded)
    yield* annotateOutcome(name, outcome)
    yield* annotateCellOutcome(outcome)
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
const namedImpl = <N extends string>(
  name: ValidOperationName<N>,
  options?: NamedCellOptions,
): <I, Raw, RE, RR>(read: (command: I) => Effect.Effect<Raw, RE, RR>) => ReadChain<I, Raw, RE, RR> => {
  const histogram = histogramFor(name, options)

  return <I, Raw, RE, RR>(read: (command: I) => Effect.Effect<Raw, RE, RR>): ReadChain<I, Raw, RE, RR> => {
    const stacktrace = String(new Error().stack)
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
        handlers: H & ExcessHandlers<H, Decision, Error>,
      ): WrittenFrom<I, RE, RR, Decision, H> => {
        type A = Effect.Success<HandlerOutput<H>>
        type WE = Effect.Error<HandlerOutput<H>>
        type WR = Effect.Services<HandlerOutput<H>>
        const run = (input: I): Effect.Effect<CellResponse<Decision, A>, RE | WE, RR | WR> =>
          monitoredRun(name, stacktrace, schemas.decideStacktrace, histogram, (settle) =>
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

/**
 * Starts a sandwich at a static operation name. The name is the parent span's name and the
 * stem of the duration metric's name; the shell boundaries it opens are the only places a
 * span is created, so an operational cell emits its trace because it was constructed.
 */
export const named: {
  <N extends string>(
    options?: NamedCellOptions,
  ): (
    name: ValidOperationName<N>,
  ) => <I, Raw, RE, RR>(run: (command: I) => Effect.Effect<Raw, RE, RR>) => ReadChain<I, Raw, RE, RR>
  <N extends string>(
    name: ValidOperationName<N>,
    options?: NamedCellOptions,
  ): <I, Raw, RE, RR>(run: (command: I) => Effect.Effect<Raw, RE, RR>) => ReadChain<I, Raw, RE, RR>
} = dual((args: IArguments) => typeof args[0] === 'string', namedImpl)

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published module graph.
  const { it } = await import('@systemfsoftware/vitest')
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

  const decideLawCommand = make({
    command: LawCommand,
    decision: Schema.Union([LawAdmitted, LawRefused]),
    error: LawMalformed,
    decide: (command): Result.Result<LawAdmitted | LawRefused, LawMalformed> =>
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
  })

  const isLocalSpan = (parent: AnySpan): parent is Span => Predicate.hasProperty(parent, 'attributes')

  /** Every handler answers the encoded outcome's tag and the cell's own span, read from inside the write phase. */
  const observe = <Outcome>(outcome: Outcome) =>
    Effect.map(
      Effect.currentSpan,
      (span) => Option.some({ tag: tagOf(outcome), operation: Option.filter(span.parent, isLocalSpan) }),
    )

  const cell = named(Operation)((command: LawCommand) => Effect.succeed(command))
    .decide(decideLawCommand)
    .write({ LawAdmitted: observe, LawRefused: observe, LawMalformed: observe, CommandRejected: observe })

  const AdmittedLength = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(3)))
  const RefusedLength = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: -100, maximum: -1 })))
  const holds = (verdicts: ReadonlyArray<boolean>): boolean => Arr.every(verdicts, (verdict) => verdict)

  it.effect.prop(
    '∀c_Span_=Named',
    { of: [AdmittedLength], subject: cell.run },
    (run, [length]) =>
      Effect.gen(function*() {
        const observed = Option.getOrThrow(yield* run(new LawCommand({ length })))
        return Option.getOrThrow(observed.operation).name === Operation
      }),
  )

  it.effect.prop(
    '∀c_Span_=Mapped',
    { of: [Schema.Int], subject: cell.run },
    (run, [length]) =>
      Effect.gen(function*() {
        const observed = Option.getOrThrow(yield* run(new LawCommand({ length })))
        const attributes = Option.getOrThrow(observed.operation).attributes
        return holds([
          attributes.get('tests.span.length') === length,
          !attributes.has('length'),
        ])
      }),
  )

  it.effect.prop(
    '∀c_Span_=Decided',
    { of: [AdmittedLength], subject: cell.run },
    (run, [length]) =>
      Effect.gen(function*() {
        const observed = Option.getOrThrow(yield* run(new LawCommand({ length })))
        const attributes = Option.getOrThrow(observed.operation).attributes
        return holds([
          attributes.get('app.span.command.law.decision') === observed.tag,
          attributes.get('tests.span.admitted.length') === length,
          !attributes.has('decision'),
        ])
      }),
  )

  it.effect.prop(
    '∀c_Span_=Refused',
    { of: [RefusedLength], subject: cell.run },
    (run, [length]) =>
      Effect.gen(function*() {
        const observed = Option.getOrThrow(yield* run(new LawCommand({ length })))
        const attributes = Option.getOrThrow(observed.operation).attributes
        return holds([
          attributes.get('app.span.command.law.failure') === 'LawMalformed',
          !attributes.has('failure'),
        ])
      }),
  )
}
