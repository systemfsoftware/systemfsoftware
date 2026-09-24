import { it } from '@effect/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import { StatusCode } from '../../tests/__fixtures__/status-code.schema.js'
import { Condition } from '../Condition.schema.js'
import { EvaluateProbe, evaluateProbe } from '../evaluate-probe.workflow.js'
import { PortNumber } from '../Port.schema.js'
import { ProbeEvidence } from '../ProbeEvidence.schema.js'
import { Wait } from '../readiness.blueprint.js'

const verdictOf = (condition: Condition, evidence: ProbeEvidence): string =>
  Result.getOrThrow(evaluateProbe(new EvaluateProbe({ condition, evidence })))._tag

const literalPatternOf = (needle: string): string => needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

it.prop('∀c_Refused_=NotYet', [Condition], ([condition]) => verdictOf(condition, { _tag: 'Refused' }) === 'NotYet')

it.prop('∀c_Absent_=NotYet', [Condition], ([condition]) => verdictOf(condition, { _tag: 'Absent' }) === 'NotYet')

it.prop(
  '∀p_Connected_=TcpSatisfied',
  [PortNumber],
  ([guestPort]) => verdictOf(Wait.forTcp(guestPort), { _tag: 'Connected' }) === 'Satisfied',
)

it.prop(
  '∀e_LogEntries_≡Contains',
  [Schema.Array(Schema.String), Schema.String],
  ([entries, needle]) =>
    (verdictOf(Wait.forLog(literalPatternOf(needle)), { _tag: 'LogEntries', entries }) === 'Satisfied') ===
      entries.some((entry) => entry.includes(needle)),
)

it.prop(
  '∀c_StatusCode_≡2xx',
  [StatusCode],
  ([code]) =>
    (verdictOf(Wait.forHttp('/', 80), { _tag: 'Responded', statusLine: `HTTP/1.1 ${code} Reason` }) === 'Satisfied') ===
      (code >= 200 && code < 300),
)
