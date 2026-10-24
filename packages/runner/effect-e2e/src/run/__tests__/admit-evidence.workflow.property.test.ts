import { it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

import { RunStatus } from '../../verdict/run-verdict.schema.js'
import { AdmitEvidence, admitEvidence, type EvidenceAdmission } from '../admit-evidence.workflow.js'

type Admit = typeof admitEvidence

const admittedBy = (admit: Admit, command: AdmitEvidence): boolean =>
  Result.match(admit(command), {
    onFailure: (missing: never) => missing,
    onSuccess: (admission: EvidenceAdmission) =>
      Match.valueTags(admission, { EvidenceAdmitted: () => true, EvidenceDeclined: () => false }),
  })

const TABLE: { readonly [Trace in AdmitEvidence['trace']]: { readonly [Status in RunStatus]: boolean } } = {
  off: { passed: false, failed: false, blocked: false, error: false, interrupted: false },
  on: { passed: true, failed: true, blocked: true, error: true, interrupted: true },
  'retain-on-failure': { passed: false, failed: true, blocked: true, error: true, interrupted: true },
}

it.prop(
  '∀c_AdmitEvidence_≡DesignTable',
  { of: [AdmitEvidence], subject: admitEvidence, arbitrary: { seed: 508_101 } },
  (subject, [command]) => admittedBy(subject, command) === TABLE[command.trace][command.status],
)
