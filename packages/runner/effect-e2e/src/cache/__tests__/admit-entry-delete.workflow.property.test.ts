import { it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

import { AdmitEntryDelete, admitEntryDelete, type DeleteAdmission } from '../admit-entry-delete.workflow.js'
import { StoreMode } from '../cache-store.schema.js'

type Admit = typeof admitEntryDelete

const admissionOf = (admit: Admit, command: AdmitEntryDelete): DeleteAdmission =>
  Result.match(admit(command), { onFailure: (missing: never) => missing, onSuccess: (admission) => admission })

const refused = (admission: DeleteAdmission): boolean =>
  Match.valueTags(admission, { DeleteAdmitted: () => false, DeleteRefused: () => true })

it.prop(
  '∀m_AdmitEntryDelete_≡RefusedIffReadOnly',
  { of: [StoreMode], subject: admitEntryDelete, arbitrary: { seed: 500_021 } },
  (subject, [mode]) => refused(admissionOf(subject, new AdmitEntryDelete({ mode }))) === (mode === 'read-only'),
)
