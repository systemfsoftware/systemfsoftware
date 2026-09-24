import type { Asserted, Check, Expect } from '@effect/vitest'
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
import { TransportObservationError } from './TransportObservationError.schema.js'
import type { Verdict } from './Verdict.schema.js'

export { ContractDecodeError, EmptyObservationError, IncompleteObservationError, TransportObservationError }

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

/**
 * What a judged contract answers: the verdict, and — when the relation broke — the report the judgement
 * leaves behind. The report is empty only for a hold, so a check over it asserts the whole judgement.
 */
export interface Report {
  readonly verdict: 'Hold' | 'Break'
  /**
   * The relation that broke, the conjunct it was evaluating, the spans it inspected, the trace, and where the
   * decoded graph was written.
   */
  readonly report: string
}

/** What a hold answers: nothing to report. */
const held: Report = { verdict: 'Hold', report: '' }

const reportOf = <Input, Output>(relationId: string, judgment: Judgment<Input, Output>): Report =>
  Match.value(judgment.verdict).pipe(
    Match.tag('Hold', (): Report => held),
    Match.tag('Break', (breach): Report => ({
      verdict: 'Break',
      report: [
        `trace contract broke: ${relationId}`,
        Option.getOrElse(FailureDump.report(breach), () => ''),
        `trace ${judgment.run.traceId}`,
        `dump ${judgment.dumpPath ?? '(not written)'}`,
      ].join('\n'),
    })),
    Match.exhaustive,
  )

const verdictCheckImpl = <Input, Output, E, R>(
  self: Contract<Input, Output, E, R>,
  expect: Expect,
  judgment: Judgment<Input, Output>,
): Check => {
  const report = reportOf(self.relation.id, judgment)
  return expect(report, report.report).toEqual(held)
}

/**
 * The one check a judgement makes: it passes only when the relation held, and its message is the report, so a
 * break names the conjunct that broke, the spans it inspected and where the evidence was written.
 */
export const verdictCheck: {
  <Input, Output, E, R>(
    expect: Expect,
    judgment: Judgment<Input, Output>,
  ): (self: Contract<Input, Output, E, R>) => Check
  <Input, Output, E, R>(
    self: Contract<Input, Output, E, R>,
    expect: Expect,
    judgment: Judgment<Input, Output>,
  ): Check
} = dual(3, verdictCheckImpl)

const checkDual = <Input, Output, E, R>(
  self: Contract<Input, Output, E, R>,
  expect: Expect,
  input: Input,
  options?: CheckOptions,
): Effect.Effect<void, JudgeFailure<E>, Asserted | Services<R>> =>
  Effect.flatMap(judgeDual(self, input, options), (judgment) => verdictCheckImpl(self, expect, judgment))

/**
 * The test edge over `judge`: the judgement and its one check. A break fails the check with the report;
 * behaviour failures and infrastructure refusals stay on the error channel.
 */
export const check: {
  <Input>(
    expect: Expect,
    input: Input,
    options?: CheckOptions,
  ): <Output, E, R>(
    self: Contract<Input, Output, E, R>,
  ) => Effect.Effect<void, JudgeFailure<E>, Asserted | Services<R>>
  <Input, Output, E, R>(
    self: Contract<Input, Output, E, R>,
    expect: Expect,
    input: Input,
    options?: CheckOptions,
  ): Effect.Effect<void, JudgeFailure<E>, Asserted | Services<R>>
} = dual((args: IArguments) => isContract(args[0]), checkDual)
