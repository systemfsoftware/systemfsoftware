import { alchemyStack } from '@systemfsoftware/alchemy-stack-layer'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as State from 'alchemy/State'
import { Cause, Effect, Exit, Layer, Scope } from 'effect'
import { type Ledger, probeStack } from './__fixtures__/probe-stack.fixture.js'
import { freshLedger, opsOf, outcomeOf, refusingDeletes, releasedExit } from './__fixtures__/stack-outcome.fixture.js'

const Feature = makeFeature({ it })

const pairSetup = (ledger: Ledger) =>
  releasedExit(
    alchemyStack('Pair', {
      stage: 'failures_pair',
      deploy: (deploy) =>
        Effect.gen(function*() {
          yield* deploy(probeStack({ ledger, stackName: 'First' }))
          return yield* deploy(probeStack({ ledger, stackName: 'Second' }))
        }),
    }).layer,
  )

const refusingRelease = (ledger: Ledger) =>
  releasedExit(
    alchemyStack('Refusing', {
      dev: false,
      stage: 'failures_refusing',
      deploy: probeStack({ ledger: refusingDeletes(ledger), stackName: 'Refusing' }),
    }).layer,
  )

const stuckLeftover = (ledger: Ledger) =>
  Effect.gen(function*() {
    const config = { dev: false, stage: 'failures_stuck' } as const
    const abandoned = yield* Scope.make()
    yield* Effect.exit(
      Layer.buildWithScope(
        alchemyStack('Stuck', { ...config, deploy: probeStack({ ledger, stackName: 'Stuck' }) }).layer,
        abandoned,
      ),
    )
    return yield* releasedExit(
      alchemyStack('Stuck', { ...config, deploy: probeStack({ ledger: refusingDeletes(ledger), stackName: 'Stuck' }) })
        .layer,
    )
  })

const memoryOnlyCloudRun = (ledger: Ledger) =>
  releasedExit(
    alchemyStack('MemoryOnly', {
      dev: false,
      stage: 'failures_memory',
      deploy: probeStack({ ledger, stackName: 'MemoryOnly', state: State.inMemoryState() }),
    }).layer,
  )

const sharedMemoryStore = (ledger: Ledger) => State.inMemoryState(ledger.records)

const occupiedMemoryStore = (ledger: Ledger) =>
  Effect.gen(function*() {
    const deploy = (dev: boolean) =>
      alchemyStack('Occupied', {
        dev,
        stage: 'failures_occupied',
        deploy: probeStack({ ledger, stackName: 'Occupied', state: sharedMemoryStore(ledger) }),
      }).layer
    const devRun = yield* Scope.make()
    const seeded = yield* Effect.exit(Layer.buildWithScope(deploy(true), devRun))
    return { seeded, cloud: yield* releasedExit(deploy(false)) }
  })

const unstagedBuild = (ledger: Ledger) =>
  releasedExit(alchemyStack('Unstaged', { deploy: probeStack({ ledger, stackName: 'Unstaged' }) }).layer)

const recordedStage = (
  ledger: Ledger,
): ReadonlyArray<string> => [...new Set(ledger.entries.map((entry) => entry.stage))]

const missingFrom = (rendering: string, facts: ReadonlyArray<string>): ReadonlyArray<string> =>
  facts.filter((fact) => !rendering.includes(fact))

const renderingOf = <A, E>(exit: Exit.Exit<A, E>): string => Exit.isFailure(exit) ? Cause.pretty(exit.cause) : ''

Feature('a stack that fails reports what failed')
  .live("deploys run on the engine's own fibers and the real clock")
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'a run where <situation> fails, and its printed failure names the stack, stage and cause',
      [
        {
          situation: 'the second stack of a setup cannot be created',
          run: pairSetup,
          refuseCreate: ['Second-probe'],
          tag: 'StackDeployFailed',
          stack: 'Second',
          stageFrom: 'ledger',
          reason: 'ProbeCreateRefused',
          ops: ['create First-probe', 'delete First-probe'],
        },
        {
          situation: 'the stack cannot be destroyed on release',
          run: refusingRelease,
          refuseCreate: [],
          tag: 'StackDestroyFailed',
          stack: 'Refusing',
          stageFrom: 'ledger',
          reason: 'ProbeDeleteRefused',
          ops: ['create Refusing-probe'],
        },
        {
          situation: 'a leftover from a killed run cannot be destroyed',
          run: stuckLeftover,
          refuseCreate: [],
          tag: 'StackDestroyFailed',
          stack: 'Stuck',
          stageFrom: 'ledger',
          reason: 'ProbeDeleteRefused',
          ops: ['create Stuck-probe'],
        },
        {
          situation: 'a cloud deploy keeps its state only in memory',
          run: memoryOnlyCloudRun,
          refuseCreate: [],
          tag: 'DurableStateRequired',
          stack: 'MemoryOnly',
          stageFrom: 'failures_memory',
          reason: 'inmemory',
          ops: [],
        },
        {
          situation: 'no stage is configured and no test file is running',
          run: unstagedBuild,
          refuseCreate: [],
          tag: 'StageUnresolved',
          stack: 'Unstaged',
          stageFrom: 'none',
          reason: 'Unstaged',
          ops: [],
        },
      ],
      (row) =>
        Gherkin.Do.pipe(
          Given('a provider that fails at that step')('ledger', () => freshLedger({ refuseCreate: row.refuseCreate })),
          When('the stack is deployed and released')('exit', (s) => row.run(s.ledger)),
          Then("the printed failure carries the stack, the recorded stage and the provider's reason")((s, expect) => {
            const rendering = renderingOf(s.exit)
            const stages = row.stageFrom === 'ledger'
              ? recordedStage(s.ledger)
              : row.stageFrom === 'none'
              ? []
              : [row.stageFrom]
            return expect({
              tag: outcomeOf(s.exit).tag,
              unknown: rendering.includes('Unknown Error'),
              missing: missingFrom(rendering, [row.stack, ...stages, row.reason]),
              stages: stages.length,
              ops: opsOf(s.ledger),
            }).toEqual({
              tag: row.tag,
              unknown: false,
              missing: [],
              stages: row.stageFrom === 'none' ? 0 : 1,
              ops: row.ops,
            })
          }),
        ),
    )

    scenario(
      'a cloud run over an in-memory store that already records a deployment fails before it touches it',
      Gherkin.Do.pipe(
        Given('a ledger whose in-memory store a dev run filled and never released')('ledger', () => freshLedger()),
        When('a cloud run of the same stack at the same stage uses that store')(
          'runs',
          (s) => occupiedMemoryStore(s.ledger),
        ),
        Then('the cloud run fails for want of durable state and nothing was deleted')((s, expect) =>
          expect({ seeded: outcomeOf(s.runs.seeded).tag, cloud: outcomeOf(s.runs.cloud).tag, ops: opsOf(s.ledger) })
            .toEqual({ seeded: 'success', cloud: 'DurableStateRequired', ops: ['create Occupied-probe'] })
        ),
      ),
    )
  })
