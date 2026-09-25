import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { Condition } from './Condition.schema.js'
import { ProbeEvidence } from './ProbeEvidence.schema.js'

const ProbeVerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-readiness/ProbeVerdict')
type ProbeVerdictTypeId = typeof ProbeVerdictTypeId

/**
 * One pass's judgement that the probe observed the condition — and the verdict the public
 * `awaitCondition` hands back when the wait ends. One class, so the per-pass decision's
 * success variant and the public result are the same value.
 */
export class Satisfied extends Schema.TaggedClass<Satisfied>()('Satisfied', {}) {
  readonly [ProbeVerdictTypeId] = ProbeVerdictTypeId
}

/** One pass's judgement that the condition does not hold yet; the shell polls again. */
export class NotYet extends Schema.TaggedClass<NotYet>()('NotYet', {}) {
  readonly [ProbeVerdictTypeId] = ProbeVerdictTypeId
}

/** The decision `evaluateProbe` reaches in one pass. */
export const ProbeVerdict = Schema.Union([Satisfied, NotYet])
export type ProbeVerdict = typeof ProbeVerdict.Type

export class EvaluateProbe extends Schema.TaggedClass<EvaluateProbe>()('EvaluateProbe', {
  condition: Condition,
  evidence: ProbeEvidence,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const statusClassOf = (statusCode: number): number => (statusCode - (statusCode % 100)) / 100

const isOkStatus = (statusCode: number): boolean => statusClassOf(statusCode) === 2

const logMatches = (pattern: string, entries: ReadonlyArray<string>): boolean =>
  entries.some((entry) => new RegExp(pattern).test(entry))

const tcpSatisfied = (evidence: ProbeEvidence): boolean =>
  Match.value(evidence).pipe(
    Match.tag('Connected', () => true),
    Match.orElse(() => false),
  )

const httpSatisfied = (evidence: ProbeEvidence): boolean =>
  Match.value(evidence).pipe(
    Match.tag('Responded', (responded) => isOkStatus(responded.statusCode)),
    Match.orElse(() => false),
  )

const logSatisfied = (pattern: string) => (evidence: ProbeEvidence): boolean =>
  Match.value(evidence).pipe(
    Match.tag('LogEntries', (entries) => logMatches(pattern, entries.entries)),
    Match.orElse(() => false),
  )

const satisfies = (condition: Condition, evidence: ProbeEvidence): boolean =>
  Match.value(condition).pipe(
    Match.tag('Tcp', () => tcpSatisfied(evidence)),
    Match.tag('Http', () => httpSatisfied(evidence)),
    Match.tag('Log', (log) => logSatisfied(log.pattern)(evidence)),
    Match.exhaustive,
  )

const verdictOf = (observed: boolean): Result.Result<ProbeVerdict, never> =>
  Match.value(observed).pipe(
    Match.when(true, () => Result.succeed(new Satisfied({}))),
    Match.when(false, () => Result.succeed(new NotYet({}))),
    Match.exhaustive,
  )

export const evaluateProbe = Workflow.make({
  command: EvaluateProbe,
  decision: ProbeVerdict,
  error: Schema.Never,
  decide: (command): Result.Result<ProbeVerdict, never> => verdictOf(satisfies(command.condition, command.evidence)),
})
