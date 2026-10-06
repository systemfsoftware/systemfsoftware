import { Contract } from '@systemfsoftware/effect-contract'
import { it } from '@systemfsoftware/vitest'
import { Result, Schema } from 'effect'
import { AdmitHost, admitHost, Allow } from '../admit-host.workflow.js'

const emptyAllow: ReadonlyArray<Contract.Host> = []

const admitted = (admit: typeof admitHost, allow: ReadonlyArray<Contract.Host>, host: Contract.Host): boolean =>
  Result.match(admit(new AdmitHost({ allow, host })), {
    onFailure: () => false,
    onSuccess: (decision) => Schema.is(Allow)(decision),
  })

it.prop(
  '∀s_AdmitHost_≡ExactMembership',
  { of: [Contract.Host], subject: admitHost },
  (admit, [host]) => admitted(admit, [host], host) && !admitted(admit, emptyAllow, host),
)
