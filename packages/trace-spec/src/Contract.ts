import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import type { Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Match, Option, Predicate, Result } from 'effect'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import { ContractDecodeError } from './ContractDecodeError.schema.js'
import { EmptyObservationError } from './EmptyObservationError.schema.js'
import * as FailureDump from './FailureDump.js'
import * as Graph from './Graph.js'
import { holdTraceContract, TraceGraphCommand } from './hold-trace-contract.workflow.js'
import { Observation } from './Observation.service.js'
import type * as Rel from './Rel.js'
import type { Run, Stimulus } from './Stimulus.js'
import { TraceDisparityError } from './TraceDisparityError.schema.js'
import type { Verdict } from './Verdict.schema.js'

export { ContractDecodeError, EmptyObservationError, TraceDisparityError }

export const TypeId = Symbol.for('@systemfsoftware/trace-spec/Contract')
export type TypeId = typeof TypeId

export interface Declared extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly taxonomy: Taxonomy.Taxonomy
  readonly stimulate: <Input, Output, E, R>(
    stimulus: Stimulus<Input, Output, E, R>,
  ) => Stimulated<Input, Output, E, R>
}

export interface Stimulated<Input, Output, E, R> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly taxonomy: Taxonomy.Taxonomy
  readonly stimulus: Stimulus<Input, Output, E, R>
  readonly holds: (relation: Rel.Relation) => Contract<Input, Output, E, R>
}

export interface Contract<Input, Output, E, R> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly taxonomy: Taxonomy.Taxonomy
  readonly stimulus: Stimulus<Input, Output, E, R>
  readonly relation: Rel.Relation
}

const stimulatedOf = <Input, Output, E, R>(
  taxonomy: Taxonomy.Taxonomy,
  stimulus: Stimulus<Input, Output, E, R>,
): Stimulated<Input, Output, E, R> => ({
  [TypeId]: TypeId,
  taxonomy,
  stimulus,
  holds: (relation) => contractOf(taxonomy, stimulus, relation),
  ...Prototype,
})

const contractOf = <Input, Output, E, R>(
  taxonomy: Taxonomy.Taxonomy,
  stimulus: Stimulus<Input, Output, E, R>,
  relation: Rel.Relation,
): Contract<Input, Output, E, R> => ({
  [TypeId]: TypeId,
  taxonomy,
  stimulus,
  relation,
  ...Prototype,
})

export const of = (taxonomy: Taxonomy.Taxonomy): Declared => ({
  [TypeId]: TypeId,
  taxonomy,
  stimulate: (stimulus) => stimulatedOf(taxonomy, stimulus),
  ...Prototype,
})

const stimulateDual = <Input, Output, E, R>(
  self: Declared,
  stimulus: Stimulus<Input, Output, E, R>,
): Stimulated<Input, Output, E, R> => stimulatedOf(self.taxonomy, stimulus)

export const stimulate: {
  <Input, Output, E, R>(
    stimulus: Stimulus<Input, Output, E, R>,
  ): (self: Declared) => Stimulated<Input, Output, E, R>
  <Input, Output, E, R>(self: Declared, stimulus: Stimulus<Input, Output, E, R>): Stimulated<Input, Output, E, R>
} = dual(2, stimulateDual)

const holdsDual = <Input, Output, E, R>(
  self: Stimulated<Input, Output, E, R>,
  relation: Rel.Relation,
): Contract<Input, Output, E, R> => contractOf(self.taxonomy, self.stimulus, relation)

export const holds: {
  (
    relation: Rel.Relation,
  ): <Input, Output, E, R>(self: Stimulated<Input, Output, E, R>) => Contract<Input, Output, E, R>
  <Input, Output, E, R>(self: Stimulated<Input, Output, E, R>, relation: Rel.Relation): Contract<Input, Output, E, R>
} = dual(2, holdsDual)

/**
 * What the observation window recorded for one run: the input, the run, and the finished
 * spans of the trace the contract minted.
 */
export interface Reading<Input, Output> {
  readonly input: Input
  readonly run: Run<Input, Output>
  readonly spans: ReadonlyArray<Graph.SpanRecord>
}

/**
 * The cell's answer: the run it judged, the verdict the relation reached, and where the
 * dump was written when the verdict broke.
 */
export interface Judgment<Input, Output> {
  readonly run: Run<Input, Output>
  readonly verdict: Verdict
  readonly dumpPath: string | null
}

export interface CellOptions {
  /**
   * Names the dump file after this instead of the trace id, so repeated runs overwrite one
   * file and the last write is the reported evidence.
   */
  readonly dumpName?: string | undefined
}

export type CellFailure<E> = E | ContractDecodeError | EmptyObservationError

export type CellServices<R> = R | Observation | FileSystem.FileSystem

export type TraceCell<Input, Output, E, R> = Cell.Cell<
  Input,
  Judgment<Input, Output>,
  CellFailure<E>,
  CellServices<R>
>

export type CheckFailure<E> = CellFailure<E> | TraceDisparityError

const OPERATION = 'trace.contract.check'

const isContract = (value: unknown): value is Contract<never, never, never, never> =>
  Predicate.hasProperty(value, TypeId)

const readOf =
  <Input, Output, E, R>(stimulus: Stimulus<Input, Output, E, R>) =>
  (input: Input): Effect.Effect<Reading<Input, Output>, E | EmptyObservationError, Observation | R> =>
    Effect.gen(function*() {
      const observation = yield* Observation
      const run = yield* stimulus(input)
      const spans = yield* observation.collect(run.traceId)
      return { input, run, spans }
    })

const decodeOf =
  <Input, Output, E, R>(self: Contract<Input, Output, E, R>) =>
  (reading: Reading<Input, Output>): Result.Result<TraceGraphCommand, ContractDecodeError> =>
    Result.map(
      Graph.decode(reading.run.traceId, reading.spans, self.taxonomy),
      (graph) => new TraceGraphCommand({ traceId: graph.traceId, nodes: graph.nodes }),
    )

interface Encoded {
  readonly verdict: Verdict
  readonly report: Option.Option<string>
}

const encodedOf = (verdict: Verdict): Encoded => ({ verdict, report: FailureDump.report(verdict) })

const encodeOf = Sandwich.pure(
  (outcome: Result.Result<Verdict, never>): Result.Result<Encoded, never> => Result.map(outcome, encodedOf),
)

const observedOf = <Input, Output>(reading: Reading<Input, Output>): FailureDump.Observed => ({
  traceId: reading.run.traceId,
  spans: reading.spans,
})

const judgmentOf = <Input, Output>(
  reading: Reading<Input, Output>,
  verdict: Verdict,
  dumpPath: string | null,
): Judgment<Input, Output> => ({ run: reading.run, verdict, dumpPath })

const assemble = <Input, Output, E, R>(
  self: Contract<Input, Output, E, R>,
  options: CellOptions | undefined,
): TraceCell<Input, Output, E, R> => {
  const write = (
    encoded: Encoded,
    reading: Reading<Input, Output>,
  ): Effect.Effect<Judgment<Input, Output>, never, FileSystem.FileSystem> =>
    Option.match(encoded.report, {
      onNone: () => Effect.succeed(judgmentOf(reading, encoded.verdict, null)),
      onSome: (report) =>
        Effect.map(
          Effect.option(
            FailureDump.write({
              ...observedOf(reading),
              conjunct: encoded.verdict.conjunct,
              report,
              name: options?.dumpName,
            }),
          ),
          (dumpPath) => judgmentOf(reading, encoded.verdict, Option.getOrNull(dumpPath)),
        ),
    })
  return Sandwich.named(OPERATION)(readOf(self.stimulus))
    .decode(Sandwich.pure(decodeOf(self)))
    .decide(holdTraceContract(self.relation))
    .encode(encodeOf)
    .write(write)
}

const cellDual = <Input, Output, E, R>(
  self: Contract<Input, Output, E, R>,
  options?: CellOptions,
): TraceCell<Input, Output, E, R> => assemble(self, options)

export const cell: {
  (options?: CellOptions): <Input, Output, E, R>(self: Contract<Input, Output, E, R>) => TraceCell<Input, Output, E, R>
  <Input, Output, E, R>(self: Contract<Input, Output, E, R>, options?: CellOptions): TraceCell<Input, Output, E, R>
} = dual((args: IArguments) => isContract(args[0]), cellDual)

const checkDual = <Input, Output, E, R>(
  self: Contract<Input, Output, E, R>,
  input: Input,
  options?: CellOptions,
): Effect.Effect<Judgment<Input, Output>, CheckFailure<E>, CellServices<R>> =>
  Effect.flatMap(assemble(self, options).run(input), (judgment) =>
    Match.value(judgment.verdict).pipe(
      Match.tag(
        'Break',
        (breach) =>
          Effect.fail(
            TraceDisparityError.make({
              relationId: self.relation.id,
              traceId: judgment.run.traceId,
              breaks: [breach],
              dumpPath: judgment.dumpPath,
            }),
          ),
      ),
      Match.tag('Hold', () => Effect.succeed(judgment)),
      Match.exhaustive,
    ))

export const check: {
  <Input>(
    input: Input,
    options?: CellOptions,
  ): <Output, E, R>(self: Contract<Input, Output, E, R>) => Effect.Effect<
    Judgment<Input, Output>,
    CheckFailure<E>,
    CellServices<R>
  >
  <Input, Output, E, R>(
    self: Contract<Input, Output, E, R>,
    input: Input,
    options?: CellOptions,
  ): Effect.Effect<Judgment<Input, Output>, CheckFailure<E>, CellServices<R>>
} = dual((args: IArguments) => isContract(args[0]), checkDual)
