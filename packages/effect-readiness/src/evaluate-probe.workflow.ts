import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { Condition } from './Condition.schema.js'
import { ProbeEvidence } from './ProbeEvidence.schema.js'

export class EvaluateProbe extends Schema.TaggedClass<EvaluateProbe>()('EvaluateProbe', {
  condition: Condition,
  evidence: ProbeEvidence,
}) {
  static readonly [Workflow.InstrumentationBrand] = [] as const
}

const STATUS_LINE_OK = /^HTTP\/[\d.]+ 2\d\d/

const isOkStatusLine = (statusLine: string): boolean => STATUS_LINE_OK.test(statusLine)

const logMatches = (pattern: string, entries: ReadonlyArray<string>): boolean =>
  entries.some((entry) => new RegExp(pattern).test(entry))

const tcpSatisfied = (evidence: ProbeEvidence): boolean =>
  Match.value(evidence).pipe(
    Match.tag('Connected', () => true),
    Match.orElse(() => false),
  )

const httpSatisfied = (evidence: ProbeEvidence): boolean =>
  Match.value(evidence).pipe(
    Match.tag('Responded', (responded) => isOkStatusLine(responded.statusLine)),
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

export const evaluateProbe = Workflow.total(
  EvaluateProbe,
  (command): Result.Result<boolean, never> => Result.succeed(satisfies(command.condition, command.evidence)),
)
