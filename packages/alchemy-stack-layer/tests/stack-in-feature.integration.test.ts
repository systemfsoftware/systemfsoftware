import { alchemyStack } from '@systemfsoftware/alchemy-stack-layer'
import { Gherkin, Given, it, makeFeature, sharedLayer, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { makeLedger, probeStack } from './__fixtures__/probe-stack.fixture.js'

const Feature = makeFeature({ it })

const ledger = makeLedger({ createDelay: '1 second' })

const opsOf = (op: 'create' | 'delete') => ledger.entries.filter((entry) => entry.op === op).length

const destroyedOnce = Effect.suspend(() =>
  opsOf('create') === 1 && opsOf('delete') === 1
    ? Effect.void
    : Effect.die(
      `expected one create and one delete after the file ended, saw ${opsOf('create')} and ${opsOf('delete')}`,
    )
)

sharedLayer(Layer.effectDiscard(Effect.addFinalizer(() => destroyedOnce)))

const SignInStack = alchemyStack('SignInStack', { deploy: probeStack({ ledger, stackName: 'SignInStack' }) })

const Shared = sharedLayer(SignInStack.layer)

Feature('signing in reads the deployed stack', { timeout: 300 }).withLayer(Shared).body(({ scenario }) => {
  scenario(
    'a deploy slower than the scenario timeout finishes before the first scenario',
    Gherkin.Do.pipe(
      Given('the stack is deployed')('stack', () => SignInStack),
      Then('its outputs are readable and it was created once')((s, expect) =>
        expect({ label: s.stack.label, creates: opsOf('create'), deletes: opsOf('delete') })
          .toEqual({ label: 'SignInStack', creates: 1, deletes: 0 })
      ),
    ),
  )
  scenario(
    'a later scenario reuses the same deploy',
    Gherkin.Do.pipe(
      Given('the stack is deployed')('stack', () => SignInStack),
      Then('no second deploy ran')((s, expect) =>
        expect({ label: s.stack.label, creates: opsOf('create'), deletes: opsOf('delete') })
          .toEqual({ label: 'SignInStack', creates: 1, deletes: 0 })
      ),
    ),
  )
})
