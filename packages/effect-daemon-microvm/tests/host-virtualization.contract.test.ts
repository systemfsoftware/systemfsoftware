import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { featureNameOf, kvmGate, kvmVerdictOf } from './__fixtures__/kvm-gate.js'

const Feature = makeFeature({ it })

Feature(
  featureNameOf('A microVM can boot on this host'),
  kvmGate.available ? undefined : { skip: true },
)
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'The host grants the virtualization device a microVM needs',
      Gherkin.Do.pipe(
        Given('the machine this suite runs on')('verdict', () => Effect.succeed(kvmVerdictOf())),
        Then('the virtualization device a microVM needs is readable and writable')(
          (state, expect) => expect(state.verdict).toBe('readable and writable'),
        ),
      ),
    )
  })
