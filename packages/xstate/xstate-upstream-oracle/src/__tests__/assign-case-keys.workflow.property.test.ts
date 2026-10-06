import { describe, it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'

import { assignCaseKeys, CaseKeyCommand, CaseKeysAssigned } from '../assign-case-keys.workflow.js'

type AssignCaseKeys = typeof assignCaseKeys

const keysOf = (subject: AssignCaseKeys, command: CaseKeyCommand): readonly string[] =>
  Result.match(subject(command), {
    onFailure: () => [],
    onSuccess: (verdict) => (Schema.is(CaseKeysAssigned)(verdict) ? verdict.keys : []),
  })

describe('assignCaseKeys', () => {
  it.prop(
    '∀report_AssignCaseKeys_≠Duplicates',
    { of: [CaseKeyCommand], subject: assignCaseKeys },
    (subject: AssignCaseKeys, [command]) => new Set(keysOf(subject, command)).size === command.cases.length,
  )

  it.prop(
    '∀report_AssignCaseKeys_≡Reordered',
    { of: [CaseKeyCommand], subject: assignCaseKeys },
    (subject: AssignCaseKeys, [command]) => {
      const reversed = CaseKeyCommand.make({ cases: [...command.cases].reverse() })
      return keysOf(subject, command).slice().sort().join('|') === keysOf(subject, reversed).slice().sort().join('|')
    },
  )
})
