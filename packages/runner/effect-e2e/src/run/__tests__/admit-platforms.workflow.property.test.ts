import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'

import { AdmitPlatforms, admitPlatforms, type PlatformAdmission } from '../admit-platforms.workflow.js'

type Admit = typeof admitPlatforms

const admissionOf = (admit: Admit, command: AdmitPlatforms): PlatformAdmission =>
  Result.match(admit(command), { onFailure: (missing: never) => missing, onSuccess: (admission) => admission })

const reasonOf = (admission: PlatformAdmission): Option.Option<string> =>
  Match.valueTags(admission, {
    Admitted: () => Option.none(),
    PlatformSkipped: ({ reason }) => Option.some(reason),
  })

const declaresTargetPlatform = (command: AdmitPlatforms): boolean =>
  Option.match(command.declared, {
    onNone: () => true,
    onSome: (declared) => declared.includes(command.platform),
  })

it.prop(
  '∀c_AdmitPlatforms_≡AdmittedExactlyWhenDeclaredOrUnrestricted',
  { of: [AdmitPlatforms], subject: admitPlatforms, arbitrary: { seed: 507_001 } },
  (subject, [command]) => Option.isNone(reasonOf(admissionOf(subject, command))) === declaresTargetPlatform(command),
)

it.prop(
  '∀c_AdmitPlatforms_→SkipReasonNamesDeclaredTargetAndPlatform',
  { of: [AdmitPlatforms], subject: admitPlatforms, arbitrary: { seed: 507_002 } },
  (subject, [command]) =>
    Option.match(reasonOf(admissionOf(subject, command)), {
      onNone: () => true,
      onSome: (reason) =>
        Arr.every(
          [...Option.getOrElse(command.declared, () => []), `"${command.target}"`, `runs on ${command.platform}`],
          (part) => reason.includes(part),
        ),
    }),
)
