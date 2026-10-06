import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  assertPathCoverage,
  coveredStructures,
  declaredStructures,
  type ModelSnapshot,
  type ModelTestStore,
  pathCoverage,
  runPaths,
  shortestPaths,
  snapshotState,
  uncoveredStructures,
} from '@systemfsoftware/transition-diagram/model-test'
import { Context, Effect, Layer } from 'effect'
import { setup } from 'xstate'
import { weirdMachine } from './__fixtures__/project/machines/weird.machine.js'

const orderMachine = setup({}).createMachine({
  id: 'order',
  initial: 'idle',
  context: () => ({ attempts: 0 }),
  states: {
    idle: { on: { SUBMIT: { target: 'reserved' } } },
    reserved: {
      on: {
        PAY: { target: 'paid' },
        CANCEL: { target: 'cancelled' },
      },
    },
    paid: { type: 'final' },
    cancelled: { type: 'final' },
  },
})

const orphanMachine = setup({}).createMachine({
  id: 'orphan',
  initial: 'a',
  states: {
    a: { on: { GO: { target: 'b' } } },
    b: { on: { BACK: { target: 'a' } } },
    orphan: { on: { X: { target: 'a' } } },
  },
})

const memoryStore = (): ModelTestStore => {
  let saved: ModelSnapshot | undefined
  return {
    save: (snapshot) => {
      saved = snapshot
    },
    load: () => saved,
  }
}

const droppingStore = (droppedState: string): ModelTestStore => {
  let saved: ModelSnapshot | undefined
  return {
    save: (snapshot) => {
      if (snapshotState(snapshot) !== droppedState) saved = snapshot
    },
    load: () => saved,
  }
}

class TestStore extends Context.Service<TestStore, ModelTestStore>()(
  '@systemfsoftware/transition-diagram/tests/model-test.integration.test/TestStore',
) {}

const memoryStoreLayer = Layer.sync(TestStore, memoryStore)

const Feature = makeFeature({ it })

const ORDER_STATES = ['cancelled', 'idle', 'paid', 'reserved'] as const
const ORDER_TRANSITIONS = [
  'idle --SUBMIT--> reserved',
  'reserved --CANCEL--> cancelled',
  'reserved --PAY--> paid',
] as const

Feature('Model-testing an XState machine against a store adapter').withScenarioLayer(memoryStoreLayer).body((
  { scenario },
) => {
  scenario(
    'Every shortest path covers each declared structure of a four-state machine',
    Gherkin.Do.pipe(
      Given('a four-state order machine')('machine', () => Effect.succeed(orderMachine)),
      When('its generated shortest paths are collected')(
        'paths',
        (state) => Effect.succeed(shortestPaths(state.machine)),
      ),
      Then('every declared state and transition is covered')((state, expect) =>
        expect({
          declared: declaredStructures(state.machine),
          covered: coveredStructures(state.paths),
          uncovered: uncoveredStructures({ machine: state.machine, paths: state.paths }),
        }).toEqual({
          declared: { states: ORDER_STATES, transitions: ORDER_TRANSITIONS },
          covered: { states: ORDER_STATES, transitions: ORDER_TRANSITIONS },
          uncovered: [],
        })
      ),
    ),
  )

  scenario(
    'Every shortest path covers the metacharacter fixture machine',
    Gherkin.Do.pipe(
      Given('the weird fixture machine')('machine', () => Effect.succeed(weirdMachine)),
      When('its generated shortest paths are collected')(
        'paths',
        (state) => Effect.succeed(shortestPaths(state.machine)),
      ),
      Then('its declared state and transition are covered')((state, expect) =>
        expect({
          declared: declaredStructures(state.machine),
          uncovered: uncoveredStructures({ machine: state.machine, paths: state.paths }),
        }).toEqual({
          declared: {
            states: ['end; there#1', 'start: here'],
            transitions: ['start: here --GO [now]--> end; there#1'],
          },
          uncovered: [],
        })
      ),
    ),
  )

  scenario(
    'A state and transitions with no generated path are named by the coverage check',
    Gherkin.Do.pipe(
      Given('a machine with an unreachable orphan state')('machine', () => Effect.succeed(orphanMachine)),
      When('the coverage of its generated paths is reported')(
        'coverage',
        (state) => Effect.succeed(pathCoverage({ machine: state.machine, paths: shortestPaths(state.machine) })),
      ),
      Then('the unreachable state and its transition are named')((state, expect) =>
        expect(state.coverage?.uncovered).toEqual([
          'state orphan',
          'transition b --BACK--> a',
          'transition orphan --X--> a',
        ])
      ),
    ),
  )

  scenario(
    'The coverage check fails when a state has no generated path',
    Gherkin.Do.pipe(
      Given('a machine with an unreachable orphan state')('machine', () => Effect.succeed(orphanMachine)),
      When('its generated shortest paths are collected')(
        'paths',
        (state) => Effect.succeed(shortestPaths(state.machine)),
      ),
      Then('the coverage check fails naming the unreachable state')((state, expect) =>
        expect(() => assertPathCoverage({ machine: state.machine, paths: state.paths }))
          .toThrow('state orphan')
      ),
    ),
  )

  scenario(
    'A store that drops one transition fails exactly that path',
    Gherkin.Do.pipe(
      Given('a four-state order machine')('machine', () => Effect.succeed(orderMachine)),
      Given('a store that drops the save into cancelled')('store', () => Effect.succeed(droppingStore('cancelled'))),
      When('every path is run against the store')(
        'runs',
        (state) => Effect.succeed(runPaths({ machine: state.machine, store: state.store })),
      ),
      Then('only the path ending in cancelled fails to round-trip')((state, expect) =>
        expect(state.runs.filter((run) => run.roundTripped === false).map((run) => run.state))
          .toEqual(['cancelled'])
      ),
    ),
  )

  scenario(
    'A store that keeps every snapshot round-trips every path',
    Gherkin.Do.pipe(
      Given('a four-state order machine')('machine', () => Effect.succeed(orderMachine)),
      When('every path is run against the store')('runs', (state) =>
        Effect.gen(function*() {
          const store = yield* TestStore
          return runPaths({ machine: state.machine, store })
        })),
      Then('every persisted snapshot restores deep-equal')((state, expect) =>
        expect({
          states: state.runs.map((run) => run.state),
          roundTripped: state.runs.map((run) => run.roundTripped),
          restored: state.runs.map((run) => run.restored),
        }).toEqual({
          states: ['idle', 'reserved', 'paid', 'cancelled'],
          roundTripped: [true, true, true, true],
          restored: state.runs.map((run) => run.persisted),
        })
      ),
    ),
  )
})
