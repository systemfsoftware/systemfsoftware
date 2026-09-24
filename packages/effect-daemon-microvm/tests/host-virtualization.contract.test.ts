import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { featureNameOf, kvmGate, kvmVerdictOf } from './__fixtures__/kvm-gate.js'

const Feature = makeFeature({ it, layer })

const HostFeature = kvmGate.available ? Feature : Feature.skip

HostFeature(featureNameOf('A microVM can boot on this host')).body(({ scenario }) => {
  scenario(
    'The host grants the virtualization device a microVM needs',
    Gherkin.Do.pipe(
      Given('the machine this suite runs on')('verdict', () => Effect.succeed(kvmVerdictOf())),
      Then('the virtualization device a microVM needs is readable and writable')((s) => {
        expect(s.verdict).toBe('readable and writable')
      }),
    ),
  )
})
