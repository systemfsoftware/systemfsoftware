import { it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import { StatusCode } from '../../tests/__fixtures__/status-code.schema.js'
import { Condition } from '../Condition.schema.js'
import { EvaluateProbe, evaluateProbe } from '../evaluate-probe.workflow.js'
import { PortNumber } from '../Port.schema.js'
import { ProbeEvidence } from '../ProbeEvidence.schema.js'
import { Wait } from '../readiness.blueprint.js'

const verdictOf = (evaluate: typeof evaluateProbe, condition: Condition, evidence: ProbeEvidence): string =>
  Result.getOrThrow(evaluate(new EvaluateProbe({ condition, evidence })))._tag

const literalPatternOf = (needle: string): string => needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

it.prop(
  '∀c_Refused_=NotYet',
  { of: [Condition], subject: evaluateProbe },
  (evaluate, [condition]) => verdictOf(evaluate, condition, { _tag: 'Refused' }) === 'NotYet',
)

it.prop(
  '∀c_Absent_=NotYet',
  { of: [Condition], subject: evaluateProbe },
  (evaluate, [condition]) => verdictOf(evaluate, condition, { _tag: 'Absent' }) === 'NotYet',
)

it.prop(
  '∀p_Connected_=TcpSatisfied',
  { of: [PortNumber], subject: evaluateProbe },
  (evaluate, [guestPort]) => verdictOf(evaluate, Wait.forTcp(guestPort), { _tag: 'Connected' }) === 'Satisfied',
)

it.prop(
  '∀e_LogEntries_≡Contains',
  { of: [Schema.Array(Schema.String), Schema.String], subject: evaluateProbe },
  (evaluate, [entries, needle]) =>
    (verdictOf(evaluate, Wait.forLog(literalPatternOf(needle)), { _tag: 'LogEntries', entries }) === 'Satisfied') ===
      entries.some((entry) => entry.includes(needle)),
)

it.prop(
  '∀c_StatusCode_≡2xx',
  { of: [StatusCode], subject: evaluateProbe },
  (evaluate, [code]) =>
    (verdictOf(evaluate, Wait.forHttp('/', 80), { _tag: 'Responded', statusLine: `HTTP/1.1 ${code} Reason` }) ===
      'Satisfied') === (code >= 200 && code < 300),
)
