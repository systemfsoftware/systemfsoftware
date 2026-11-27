import { alchemyStack, StackDestroyFailed, type StackLayerError } from '@systemfsoftware/alchemy-stack-layer'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as State from 'alchemy/State'
import { Cause, Effect, Exit, Layer, Match, Option, Schema, Scope } from 'effect'
import { type Ledger, makeLedger, probeStack } from './__fixtures__/probe-stack.fixture.js'

const Feature = makeFeature({ it })

interface Outcome {
  readonly tag: string
  readonly stack?: string
  readonly stage?: string
}

const isDestroyFailed = Schema.is(StackDestroyFailed)

const located = (tag: string) => (error: { readonly stack: string; readonly stage: string }): Outcome => ({
  tag,
  stack: error.stack,
  stage: error.stage,
})

const describeError = (error: StackLayerError | StackDestroyFailed): Outcome =>
  Match.valueTags(error, {
    StageUnresolved: (unresolved) => ({ tag: 'StageUnresolved', stack: unresolved.stack }),
    StackDeployFailed: located('StackDeployFailed'),
    StackDestroyFailed: located('StackDestroyFailed'),
    DurableStateRequired: located('DurableStateRequired'),
  })

const defectOutcome = <E>(cause: Cause.Cause<E>): Outcome => {
  const squashed = Cause.squash(cause)
  return isDestroyFailed(squashed) ? describeError(squashed) : { tag: Cause.pretty(cause) }
}

const failureOutcome = (cause: Cause.Cause<StackLayerError>): Outcome =>
  Option.match(Cause.findErrorOption(cause), { onNone: () => defectOutcome(cause), onSome: describeError })

const outcomeOf = <A>(exit: Exit.Exit<A, StackLayerError>): Outcome =>
  Exit.isSuccess(exit) ? { tag: 'success' } : failureOutcome(exit.cause)

const releasedExit = <A>(layer: Layer.Layer<A, StackLayerError>) => Effect.exit(Effect.scoped(Layer.build(layer)))

const opsOf = (ledger: Ledger) => ledger.entries.map((entry) => `${entry.op} ${entry.id}`)

const fresh = (refuseCreate: ReadonlyArray<string> = [], refuseDelete = false) =>
  Effect.sync(() => makeLedger({ refuseCreate: new Set(refuseCreate), refuseDelete }))

Feature('deploying and destroying a stack on the engine')
  .live("deploys run on the engine's own fibers and the real clock")
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'a setup that deploys a second stack which fails still destroys the first',
      Gherkin.Do.pipe(
        Given('a ledger that refuses to create the second stack')('ledger', () => fresh(['Second-probe'])),
        When('the setup deploys the first stack, then the second, and the file ends')('exit', (s) =>
          releasedExit(
            alchemyStack('Pair', {
              stage: 'lifecycle_pair',
              deploy: (deploy) =>
                Effect.gen(function*() {
                  yield* deploy(probeStack({ ledger: s.ledger, stackName: 'First' }))
                  return yield* deploy(probeStack({ ledger: s.ledger, stackName: 'Second' }))
                }),
            }).layer,
          )),
        Then('the second deploy failure is reported and the first stack was destroyed')((s, expect) =>
          expect({ outcome: outcomeOf(s.exit), ops: opsOf(s.ledger) }).toEqual({
            outcome: { tag: 'StackDeployFailed', stack: 'Second', stage: 'lifecycle_pair' },
            ops: ['create First-probe', 'delete First-probe'],
          })
        ),
      ),
    )

    scenario(
      'a destroy that fails fails the release and names the stack and stage',
      Gherkin.Do.pipe(
        Given('a ledger whose deletes fail')('ledger', () => fresh([], true)),
        When('a cloud deploy of the stack is released')('exit', (s) =>
          releasedExit(
            alchemyStack('Refusing', {
              dev: false,
              stage: 'lifecycle_refusing',
              deploy: probeStack({ ledger: s.ledger, stackName: 'Refusing' }),
            }).layer,
          )),
        Then('the release fails with the stack and its stage')((s, expect) =>
          expect(outcomeOf(s.exit)).toEqual({
            tag: 'StackDestroyFailed',
            stack: 'Refusing',
            stage: 'lifecycle_refusing',
          })
        ),
      ),
    )

    scenario(
      'a run killed before teardown is reclaimed by the next run at the same stage',
      Gherkin.Do.pipe(
        Given('a ledger shared by both runs')('ledger', () => fresh()),
        When('the first run deploys and its scope is never closed')('abandoned', (s) =>
          Effect.gen(function*() {
            const scope = yield* Scope.make()
            const layer = alchemyStack('Reclaimed', {
              dev: false,
              stage: 'lifecycle_reclaimed',
              deploy: probeStack({ ledger: s.ledger, stackName: 'Reclaimed' }),
            }).layer
            return yield* Effect.exit(Layer.buildWithScope(layer, scope))
          })),
        When('the next run deploys at the same stage and ends')('exit', (s) =>
          releasedExit(
            alchemyStack('Reclaimed', {
              dev: false,
              stage: 'lifecycle_reclaimed',
              deploy: probeStack({ ledger: s.ledger, stackName: 'Reclaimed' }),
            }).layer,
          )),
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
      'a cloud run over local state fails before anything deploys',
      Gherkin.Do.pipe(
        Given('a ledger for a stack kept only in process memory')('ledger', () => fresh()),
        When('the stack is deployed to the cloud')('exit', (s) =>
          releasedExit(
            alchemyStack('LocalOnly', {
              dev: false,
              stage: 'lifecycle_local',
              deploy: probeStack({ ledger: s.ledger, stackName: 'LocalOnly', state: State.inMemoryState() }),
            }).layer,
          )),
        Then('it fails saying durable state is required, and nothing was created or deleted')((s, expect) =>
          expect({ outcome: outcomeOf(s.exit), ops: opsOf(s.ledger) }).toEqual({
            outcome: { tag: 'DurableStateRequired', stack: 'LocalOnly', stage: 'lifecycle_local' },
            ops: [],
          })
        ),
      ),
    )

    scenario(
      'a stack with no configured stage built outside a test file has no stage',
      Gherkin.Do.pipe(
        Given('a ledger')('ledger', () => fresh()),
        When('the stack is built where no running test file is known')(
          'exit',
          (s) =>
            releasedExit(
              alchemyStack('Unstaged', { deploy: probeStack({ ledger: s.ledger, stackName: 'Unstaged' }) }).layer,
            ),
        ),
        Then('it fails naming the stack, and nothing was created')((s, expect) =>
          expect({ outcome: outcomeOf(s.exit), ops: opsOf(s.ledger) }).toEqual({
            outcome: { tag: 'StageUnresolved', stack: 'Unstaged' },
            ops: [],
          })
        ),
      ),
    )

    scenario(
      'two stacks are destroyed in reverse deploy order',
      Gherkin.Do.pipe(
        Given('a ledger')('ledger', () => fresh()),
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
        Given('a ledger')('ledger', () => fresh()),
        When('a config that says dev runs with no engine toggle and no sidecar')('exit', (s) =>
          releasedExit(
            alchemyStack('Local', {
              dev: true,
              sidecar: false,
              stage: 'lifecycle_dev',
              deploy: probeStack({ ledger: s.ledger, stackName: 'Local' }),
            }).layer,
          )),
        Then('the deploy ran against the local target')((s, expect) =>
          expect({ outcome: outcomeOf(s.exit), devFlags: s.ledger.entries.map((entry) => entry.dev) }).toEqual({
            outcome: { tag: 'success' },
            devFlags: [true, true],
          })
        ),
      ),
    )
  })
