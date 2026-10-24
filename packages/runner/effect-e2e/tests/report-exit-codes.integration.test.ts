import { decodeConfig, defineConfig, exitCodeOf, type RunEnding } from '@systemfsoftware/effect-e2e'
import type { ModelAnswer } from '@systemfsoftware/effect-e2e/model'
import { admitTest, type StepHandle, type TestSessionShape, type TryEnding } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { done, GREET_SITE, ORIGIN, tap } from './__fixtures__/agent-sites.fixture.js'
import { proposeCause, resolveCheck } from './__fixtures__/judgment-sites.fixture.js'
import { countedEngine, inTry, targetOf, TEST, worldOf } from './__fixtures__/run-sessions.fixture.js'

const Feature = makeFeature({ it })

const joined = <A, E>(handle: StepHandle<A, E>): Effect.Effect<A, E> => handle.join

const greetingContains = (value: string): ModelAnswer =>
  resolveCheck({
    combine: 'all',
    literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value }],
  })

const pressThenAssert = (statement: string) => (session: TestSessionShape) =>
  Effect.gen(function*() {
    yield* session.open('/').pipe(Effect.flatMap(joined), Effect.ignore)
    yield* session.act({ instruction: 'press Greet' }).pipe(Effect.flatMap(joined), Effect.ignore)
    yield* session.assert({ statement }).pipe(Effect.flatMap(joined), Effect.ignore)
  })

const FINISHED: TryEnding = { _tag: 'Finished', errors: [] }

interface Run {
  readonly answers: ReadonlyArray<ModelAnswer>
  readonly body: (session: TestSessionShape) => Effect.Effect<void>
  readonly ending: TryEnding
}

const RUNS = {
  passing: {
    answers: [tap('greet'), done('greeted Ada'), greetingContains('Hello')],
    body: pressThenAssert('the greeting says hello'),
    ending: FINISHED,
  },
  failing: {
    answers: [
      tap('greet'),
      done('greeted Ada'),
      greetingContains('Goodbye'),
      proposeCause({ cause: 'product', evidence: [{ ref: 'hello' }], reason: 'the greeting does not say goodbye' }),
    ],
    body: pressThenAssert('the greeting says goodbye'),
    ending: FINISHED,
  },
  unreachable: {
    answers: [],
    body: (session) => session.open('/missing').pipe(Effect.flatMap(joined), Effect.ignore),
    ending: FINISHED,
  },
  broken: {
    answers: [],
    body: () => Effect.void,
    ending: {
      _tag: 'Finished',
      errors: [{
        code: 'INTERNAL_ERROR',
        cause: 'unclassified',
        evidence: [{ _tag: 'LogEvidence', text: 'the runner lost its session' }],
      }],
    },
  },
  cancelled: { answers: [], body: () => Effect.void, ending: { _tag: 'Cancelled' } },
} satisfies Record<string, Run>

const judgedExitOf = (run: Run) =>
  Effect.gen(function*() {
    const world = yield* worldOf({ mode: 'read-only', answers: run.answers })
    const engine = yield* countedEngine(GREET_SITE)
    yield* inTry({
      world,
      retry: 0,
      engine: engine.source,
      body: (session) => Effect.andThen(run.body(session), session.endAttempt(run.ending)),
    })
    const ending: RunEnding = { _tag: 'Judged', verdict: yield* world.log.verdict }
    return exitCodeOf(ending)
  })

const onlySkippedExit = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-only', answers: [] })
  yield* admitTest({ log: world.log, test: TEST, target: targetOf(world), agent: 'default', platforms: ['ios'] })
  const ending: RunEnding = { _tag: 'Judged', verdict: yield* world.log.verdict }
  return exitCodeOf(ending)
})

const CONFIG = defineConfig({
  projectId: 'exit-codes',
  targets: [{
    name: 'web',
    engine: { _tag: 'WebEngine', adapter: '@systemfsoftware/effect-e2e-web', browser: 'chromium' },
    app: { url: ORIGIN, identity: 'greet-app' },
  }],
})

const WITH_UNKNOWN_KEY = { ...CONFIG, region: 'eu-west-1' }

const refusedConfigExit = Effect.map(
  Effect.flip(decodeConfig(WITH_UNKNOWN_KEY, { ci: false, projectId: 'exit-codes', cores: 1 })),
  (error) => exitCodeOf({ _tag: 'ConfigRefused', error }),
)

Feature('Mapping how a run ended to the exit code CI reads')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Every run ending exits with the code the FR-5 table fixes',
      Gherkin.Do.pipe(
        When('a passing, a failing, an unreachable, a broken, a cancelled and an only-skipped run end')(
          'judged',
          () =>
            Effect.all({
              passing: judgedExitOf(RUNS.passing),
              failing: judgedExitOf(RUNS.failing),
              unreachable: judgedExitOf(RUNS.unreachable),
              broken: judgedExitOf(RUNS.broken),
              cancelled: judgedExitOf(RUNS.cancelled),
              onlySkipped: onlySkippedExit,
            }),
        ),
        Then('they exit 0, 1, 3, 4, 130 and 0')((s, expect) =>
          expect(s.judged).toEqual({
            passing: 0,
            failing: 1,
            unreachable: 3,
            broken: 4,
            cancelled: 130,
            onlySkipped: 0,
          })
        ),
      ),
    )

    scenario(
      'A config with an unknown key exits 2 before any test runs',
      Gherkin.Do.pipe(
        When('a suite config naming an unknown top-level key is decoded and refused')('exit', () => refusedConfigExit),
        Then('the run exits 2')((s, expect) => expect(s.exit).toBe(2)),
      ),
    )
  })
