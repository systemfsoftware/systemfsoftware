import { it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import { Condition } from '../Condition.schema.js'
import { StatusCode } from '../DialEvidence.schema.js'
import { EvaluateProbe, evaluateProbe, NotYet, type ProbeVerdict, Satisfied } from '../evaluate-probe.workflow.js'
import { PortNumber } from '../Port.schema.js'
import { ProbeEvidence } from '../ProbeEvidence.schema.js'
import { Wait } from '../readiness.blueprint.js'

const verdictHolds = (
  evaluate: typeof evaluateProbe,
  condition: Condition,
  evidence: ProbeEvidence,
  holds: (verdict: ProbeVerdict) => boolean,
): boolean =>
  Result.match(evaluate(new EvaluateProbe({ condition, evidence })), {
    onFailure: () => false,
    onSuccess: (verdict) => holds(verdict),
  })

const literalPatternOf = (needle: string): string => needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

it.prop(
  '∀c_Refused_=NotYet',
  { of: [Condition], subject: evaluateProbe },
  (evaluate, [condition]) =>
    verdictHolds(evaluate, condition, { _tag: 'Refused' }, (verdict) => Schema.is(NotYet)(verdict)),
)

it.prop(
  '∀c_Absent_=NotYet',
  { of: [Condition], subject: evaluateProbe },
  (evaluate, [condition]) =>
    verdictHolds(evaluate, condition, { _tag: 'Absent' }, (verdict) => Schema.is(NotYet)(verdict)),
)

it.prop(
  '∀p_Connected_=TcpSatisfied',
  { of: [PortNumber], subject: evaluateProbe },
  (evaluate, [guestPort]) =>
    verdictHolds(evaluate, Wait.forTcp(guestPort), { _tag: 'Connected' }, (verdict) => Schema.is(Satisfied)(verdict)),
)

it.prop(
  '∀e_LogEntries_≡Contains',
  { of: [Schema.Array(Schema.String), Schema.String], subject: evaluateProbe },
  (evaluate, [entries, needle]) =>
    verdictHolds(
      evaluate,
      Wait.forLog(literalPatternOf(needle)),
      { _tag: 'LogEntries', entries },
      (verdict) => Schema.is(Satisfied)(verdict) === entries.some((entry) => entry.includes(needle)),
    ),
)

it.prop(
  '∀c_StatusCode_≡2xx',
  { of: [StatusCode], subject: evaluateProbe },
  (evaluate, [statusCode]) =>
    verdictHolds(
      evaluate,
      Wait.forHttp('/', 80),
      { _tag: 'Responded', statusCode },
      (verdict) => Schema.is(Satisfied)(verdict) === (statusCode >= 200 && statusCode < 300),
    ),
)
