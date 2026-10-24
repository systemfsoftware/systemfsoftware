import { it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

import { RunStatus } from '../../verdict/run-verdict.schema.js'
import { AdmitAiTrace, admitAiTrace, type AiTraceAdmission } from '../admit-ai-trace.workflow.js'

type Admit = typeof admitAiTrace

const admittedBy = (admit: Admit, command: AdmitAiTrace): boolean =>
  Result.match(admit(command), {
    onFailure: (missing: never) => missing,
    onSuccess: (admission: AiTraceAdmission) =>
      Match.valueTags(admission, { AiTraceAdmitted: () => true, AiTraceDeclined: () => false }),
  })

const TABLE: { readonly [AiTrace in `${boolean}`]: { readonly [Status in RunStatus]: boolean } } = {
  false: { passed: false, failed: false, blocked: false, error: false, interrupted: false },
  true: { passed: false, failed: true, blocked: true, error: true, interrupted: true },
}

it.prop(
  '∀c_AdmitAiTrace_≡DesignTable',
  { of: [AdmitAiTrace], subject: admitAiTrace, arbitrary: { seed: 643_401 } },
  (subject, [command]) => admittedBy(subject, command) === TABLE[`${command.aiTrace}`][command.status],
)
