import { recordAssertion } from '@effect/vitest'
import type { Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { Effect, FileSystem, Match, Option, Predicate } from 'effect'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import { ContractDecodeError } from './ContractDecodeError.schema.js'
import { EmptyObservationError } from './EmptyObservationError.schema.js'
import * as FailureDump from './FailureDump.js'
import * as Graph from './Graph.js'
import { IncompleteObservationError } from './IncompleteObservationError.schema.js'
import { Observation, type ObservationFailure } from './Observation.service.js'
import type * as Rel from './Rel.js'
import type { Run, Stimulus } from './Stimulus.js'
import { TraceDisparityError } from './TraceDisparityError.schema.js'
import { TransportObservationError } from './TransportObservationError.schema.js'
import type { Verdict } from './Verdict.schema.js'

export {
  ContractDecodeError,
  EmptyObservationError,
  IncompleteObservationError,
  TraceDisparityError,
  TransportObservationError,
}

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

export interface Judgment<Input, Output> {
  readonly run: Run<Input, Output>
  readonly verdict: Verdict
  readonly dumpPath: string | null
}

export interface CheckOptions {
  readonly dumpName?: string | undefined
}

export type JudgeFailure<E> = E | ContractDecodeError | ObservationFailure

export type CheckFailure<E> = JudgeFailure<E> | TraceDisparityError

export type Services<R> = R | Observation | FileSystem.FileSystem

const isContract = (value: unknown): value is Contract<never, never, never, never> =>
  Predicate.hasProperty(value, TypeId)

const dumpOf = (
  observed: FailureDump.Observed,
  verdict: Verdict,
  options: CheckOptions | undefined,
): Effect.Effect<string | null, never, FileSystem.FileSystem> =>
  Option.match(FailureDump.report(verdict), {
    onNone: () => Effect.succeed(null),
    onSome: (report) =>
      Effect.map(
        Effect.option(FailureDump.write({ ...observed, conjunct: verdict.conjunct, report, name: options?.dumpName })),
        Option.getOrNull,
      ),
  })

const judgeDual = <Input, Output, E, R>(
  self: Contract<Input, Output, E, R>,
  input: Input,
  options?: CheckOptions,
): Effect.Effect<Judgment<Input, Output>, JudgeFailure<E>, Services<R>> =>
  Effect.gen(function*() {
    const observation = yield* Observation
    const run = yield* self.stimulus(input)
    const spans = yield* observation.collect(run.traceId)
    const graph = yield* Effect.fromResult(Graph.decode(run.traceId, spans, self.taxonomy))
    const verdict = self.relation(graph)
    const dumpPath = yield* dumpOf({ traceId: run.traceId, spans }, verdict, options)
    return { run, verdict, dumpPath }
  })

export const judge: {
  <Input>(
    input: Input,
    options?: CheckOptions,
  ): <Output, E, R>(
    self: Contract<Input, Output, E, R>,
  ) => Effect.Effect<Judgment<Input, Output>, JudgeFailure<E>, Services<R>>
  <Input, Output, E, R>(
    self: Contract<Input, Output, E, R>,
    input: Input,
    options?: CheckOptions,
  ): Effect.Effect<Judgment<Input, Output>, JudgeFailure<E>, Services<R>>
} = dual((args: IArguments) => isContract(args[0]), judgeDual)

const refuseBreak = <Input, Output>(
  relationId: string,
  judgment: Judgment<Input, Output>,
): Effect.Effect<Judgment<Input, Output>, TraceDisparityError> =>
  Match.value(judgment.verdict).pipe(
    Match.tag('Break', (breach) =>
      Effect.fail(
        TraceDisparityError.make({
          relationId,
          traceId: judgment.run.traceId,
          breaks: [breach],
          dumpPath: judgment.dumpPath,
        }),
      )),
    Match.tag('Hold', () => Effect.succeed(judgment)),
    Match.exhaustive,
  )

const checkDual = <Input, Output, E, R>(
  self: Contract<Input, Output, E, R>,
  input: Input,
  options?: CheckOptions,
): Effect.Effect<Judgment<Input, Output>, CheckFailure<E>, Services<R>> =>
  Effect.flatMap(
    judgeDual(self, input, options),
    (judgment) => Effect.andThen(Effect.sync(recordAssertion), refuseBreak(self.relation.id, judgment)),
  )

export const check: {
  <Input>(
    input: Input,
    options?: CheckOptions,
  ): <Output, E, R>(
    self: Contract<Input, Output, E, R>,
  ) => Effect.Effect<Judgment<Input, Output>, CheckFailure<E>, Services<R>>
  <Input, Output, E, R>(
    self: Contract<Input, Output, E, R>,
    input: Input,
    options?: CheckOptions,
  ): Effect.Effect<Judgment<Input, Output>, CheckFailure<E>, Services<R>>
} = dual((args: IArguments) => isContract(args[0]), checkDual)
