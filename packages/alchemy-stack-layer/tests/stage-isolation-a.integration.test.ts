import { alchemyStack } from '@systemfsoftware/alchemy-stack-layer'
import { Gherkin, Given, it, makeFeature, sharedLayer, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { makeLedger, probeStack } from './__fixtures__/probe-stack.fixture.js'
import { deletedOnlyAt } from './__fixtures__/stack-outcome.fixture.js'

const Feature = makeFeature({ it })

const THIS_FILE_STAGE = 'offline_44304a69'

const ledger = makeLedger()

const stagesOf = (op: 'create' | 'delete') =>
  ledger.entries.filter((entry) => entry.op === op).map((entry) => entry.stage)

sharedLayer(Layer.effectDiscard(Effect.addFinalizer(() => deletedOnlyAt({ ledger, stage: THIS_FILE_STAGE }))))

const SharedStack = alchemyStack('SharedStack', { deploy: probeStack({ ledger, stackName: 'SharedStack' }) })

Feature('a stack deployed from the first of two files')
  .withLayer(sharedLayer(SharedStack.layer))
  .body(({ scenario }) => {
    scenario(
      'the deploy runs under a stage suffixed for this file',
      Gherkin.Do.pipe(
        Given('the stack is deployed with no configured stage')('stack', () => SharedStack),
        Then("its stage is the base stage plus this file's suffix")((s, expect) =>
          expect({ label: s.stack.label, stages: stagesOf('create') }).toEqual({
            label: 'SharedStack',
            stages: [THIS_FILE_STAGE],
          })
        ),
      ),
    )
  })
