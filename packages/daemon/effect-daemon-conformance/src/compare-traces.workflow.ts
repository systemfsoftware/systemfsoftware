import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Option, Result, Schema } from 'effect'
import type { ObservedStep } from './Trace.schema.js'
import { ObservedStep as ObservedStepSchema } from './Trace.schema.js'

const ComparisonTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-conformance/TraceComparison')
type ComparisonTypeId = typeof ComparisonTypeId

/** The candidate reproduced the reference within its declaration. */
export class TracesConform extends Schema.TaggedClass<TracesConform>()('TracesConform', {
  scenario: Schema.String,
  medium: Schema.String,
  compared: Schema.Int,
}) {
  readonly [ComparisonTypeId] = ComparisonTypeId
}

/** The candidate first diverged from the reference at `index`. */
export class TracesDiverge extends Schema.TaggedClass<TracesDiverge>()('TracesDiverge', {
  scenario: Schema.String,
  medium: Schema.String,
  index: Schema.Int,
  reference: Schema.String,
  candidate: Schema.String,
}) {
  readonly [ComparisonTypeId] = ComparisonTypeId
}

export const TraceComparison = Schema.Union([TracesConform, TracesDiverge])
export type TraceComparison = typeof TraceComparison.Type

/**
 * Compares two traces already projected to one medium's declaration, so a
 * projection's losses — a coarsened report, a relaxed stop order — are applied
 * before the decision runs and never inside it.
 */
export class CompareTraces extends Schema.TaggedClass<CompareTraces>()('CompareTraces', {
  scenario: Schema.String,
  medium: Schema.String,
  reference: Schema.Array(ObservedStepSchema),
  candidate: Schema.Array(ObservedStepSchema),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const stepKeyOf = (step: ObservedStep): string => JSON.stringify(step)

const isDifferent = (step: ObservedStep, other: Option.Option<ObservedStep>): boolean =>
  Option.match(other, {
    onNone: () => true,
    onSome: (present) => stepKeyOf(step) !== stepKeyOf(present),
  })

const overlappingDivergence = (
  reference: ReadonlyArray<ObservedStep>,
  candidate: ReadonlyArray<ObservedStep>,
): Option.Option<number> => Arr.findFirstIndex(reference, (step, index) => isDifferent(step, Arr.get(candidate, index)))

const surplusDivergence = (
  reference: ReadonlyArray<ObservedStep>,
  candidate: ReadonlyArray<ObservedStep>,
): Option.Option<number> => Option.filter(Option.some(reference.length), (index) => index < candidate.length)

const divergenceIndexOf = (
  reference: ReadonlyArray<ObservedStep>,
  candidate: ReadonlyArray<ObservedStep>,
): Option.Option<number> =>
  Option.orElse(overlappingDivergence(reference, candidate), () => surplusDivergence(reference, candidate))

const stepKeyAt = (steps: ReadonlyArray<ObservedStep>, index: number): string =>
  Option.match(Arr.get(steps, index), {
    onNone: () => '<missing>',
    onSome: stepKeyOf,
  })

const comparisonOf = (command: CompareTraces): TraceComparison =>
  Option.match(divergenceIndexOf(command.reference, command.candidate), {
    onNone: () =>
      new TracesConform({
        scenario: command.scenario,
        medium: command.medium,
        compared: command.reference.length,
      }),
    onSome: (index) =>
      new TracesDiverge({
        scenario: command.scenario,
        medium: command.medium,
        index,
        reference: stepKeyAt(command.reference, index),
        candidate: stepKeyAt(command.candidate, index),
      }),
  })

export const compareTraces = Workflow.make({
  command: CompareTraces,
  decision: TraceComparison,
  error: Schema.Never,
  decide: (command): Result.Result<TraceComparison, never> => Result.succeed(comparisonOf(command)),
})
