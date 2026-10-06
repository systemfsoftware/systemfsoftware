import { it } from '@systemfsoftware/vitest'
import { Match, Result, Schema } from 'effect'
import { Person, Principal, Subject } from '../../Principal/principal.schema.js'
import {
  CheckOperationVisibility,
  checkOperationVisibility,
  OperationVisible,
} from '../check-operation-visibility.workflow.js'

const visibleByRule = (owner: Principal, principal: Principal): boolean =>
  Match.value(owner).pipe(
    Match.tag('Anonymous', () => true),
    Match.tag('Person', (owner) =>
      Match.value(principal).pipe(
        Match.tag('Person', (asker) => Schema.toEquivalence(Subject)(owner.subject, asker.subject)),
        Match.tag('Anonymous', () => false),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

it.prop(
  '∀x_CheckOperationVisibility_≡ReadRule',
  { of: [Principal, Principal], subject: checkOperationVisibility },
  (check, [owner, principal]) =>
    Result.match(check(new CheckOperationVisibility({ owner, principal })), {
      onFailure: () => false,
      onSuccess: (decision) => Schema.is(OperationVisible)(decision) === visibleByRule(owner, principal),
    }),
)

it.prop(
  '∀s_PersonOwner_≡SeesOwnSubject',
  { of: [Subject], subject: checkOperationVisibility },
  (check, [subject]) => {
    const owner = new Person({ subject, scopes: [] })
    const asker = new Person({ subject, scopes: [] })
    return Result.match(check(new CheckOperationVisibility({ owner, principal: asker })), {
      onFailure: () => false,
      onSuccess: (decision) => Schema.is(OperationVisible)(decision),
    })
  },
)
