import { alchemyStack } from '@systemfsoftware/alchemy-stack-layer'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Scope } from 'effect'
import { type Ledger, ProbeRegion, probeStack } from './__fixtures__/probe-stack.fixture.js'
import { freshLedger, opsOf, outcomeOf, releasedExit } from './__fixtures__/stack-outcome.fixture.js'

const Feature = makeFeature({ it })

const reclaimed = (ledger: Ledger) =>
  alchemyStack('Reclaimed', {
    dev: false,
    stage: 'lifecycle_reclaimed',
    deploy: probeStack({ ledger, stackName: 'Reclaimed' }),
  })

Feature('deploying and destroying a stack on the engine')
  .live("deploys run on the engine's own fibers and the real clock")
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'a run killed before teardown is reclaimed by the next run at the same stage',
      Gherkin.Do.pipe(
        Given('a ledger shared by both runs')('ledger', () => freshLedger()),
        When('the first run deploys and its scope is never closed')('abandoned', (s) =>
          Effect.gen(function*() {
            const scope = yield* Scope.make()
            return yield* Effect.exit(Layer.buildWithScope(reclaimed(s.ledger).layer, scope))
          })),
        When('the next run deploys at the same stage and ends')('exit', (s) => releasedExit(reclaimed(s.ledger).layer)),
        Then('the leftover was destroyed before the new deploy')((s, expect) =>
          expect({ first: outcomeOf(s.abandoned), next: outcomeOf(s.exit), ops: opsOf(s.ledger) }).toEqual({
            first: { tag: 'success' },
            next: { tag: 'success' },
            ops: [
              'create Reclaimed-probe',
              'delete Reclaimed-probe',
              'create Reclaimed-probe',
              'delete Reclaimed-probe',
            ],
          })
        ),
      ),
    )

    scenario(
      'a setup layer provides what the deploy function needs, and the stack layer requires nothing more',
      Gherkin.Do.pipe(
        Given('a ledger')('ledger', () => freshLedger()),
        When('a stack whose deploy function reads a region from its setup layer is deployed and released')(
          'released',
          (s) =>
            Effect.scoped(
              Effect.gen(function*() {
                const stack = alchemyStack('Regional', {
                  stage: 'lifecycle_regional',
                  setup: Layer.succeed(ProbeRegion, 'eu-west'),
                  deploy: (deploy) =>
                    Effect.gen(function*() {
                      const region = yield* ProbeRegion
                      const deployed = yield* deploy(probeStack({ ledger: s.ledger, stackName: 'Regional' }))
                      return { label: deployed.label, region }
                    }),
                })
                const services = yield* Layer.build(stack.layer)
                return Context.get(services, stack)
              }),
            ),
        ),
        Then('the outputs carry the deployed label and the setup region, and the stack was created then destroyed')((
          s,
          expect,
        ) =>
          expect({ outputs: s.released, ops: opsOf(s.ledger) }).toEqual({
            outputs: { label: 'Regional', region: 'eu-west' },
            ops: ['create Regional-probe', 'delete Regional-probe'],
          })
        ),
      ),
    )

    scenario(
      'two stacks are destroyed in reverse deploy order',
      Gherkin.Do.pipe(
        Given('a ledger')('ledger', () => freshLedger()),
        When('a setup deploys stack A then stack B and the file ends')('exit', (s) =>
          releasedExit(
            alchemyStack('Ordered', {
              stage: 'lifecycle_ordered',
              deploy: (deploy) =>
                Effect.gen(function*() {
                  yield* deploy(probeStack({ ledger: s.ledger, stackName: 'A' }))
                  return yield* deploy(probeStack({ ledger: s.ledger, stackName: 'B' }))
                }),
            }).layer,
          )),
        Then('B is destroyed before A')((s, expect) =>
          expect({ outcome: outcomeOf(s.exit), ops: opsOf(s.ledger) }).toEqual({
            outcome: { tag: 'success' },
            ops: ['create A-probe', 'create B-probe', 'delete B-probe', 'delete A-probe'],
          })
        ),
      ),
    )

    scenario(
      'without the engine toggle the config dev flag decides',
      Gherkin.Do.pipe(
        Given('a ledger')('ledger', () => freshLedger()),
        When('a config that says dev runs with no engine toggle, so its sidecar opens and closes with the layer')(
          'exit',
          (s) =>
            releasedExit(
              alchemyStack('Local', {
                dev: true,
                stage: 'lifecycle_dev',
                deploy: probeStack({ ledger: s.ledger, stackName: 'Local' }),
              }).layer,
            ),
        ),
        Then('the deploy ran against the local target')((s, expect) =>
          expect({ outcome: outcomeOf(s.exit), devFlags: s.ledger.entries.map((entry) => entry.dev) }).toEqual({
            outcome: { tag: 'success' },
            devFlags: [true, true],
          })
        ),
      ),
    )
  })
