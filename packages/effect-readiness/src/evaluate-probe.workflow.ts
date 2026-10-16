import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { Condition } from './Condition.schema.js'
import { ProbeEvidence } from './ProbeEvidence.schema.js'
import { NotYet, ProbeVerdict, Satisfied } from './ProbeVerdict.schema.js'

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
