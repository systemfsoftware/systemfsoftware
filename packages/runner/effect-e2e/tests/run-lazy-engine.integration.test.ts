import type { StepHandle } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'

import { done, GREET_SITE } from './__fixtures__/agent-sites.fixture.js'
import {
  type CountedEngine,
  countedEngine,
  inTry,
  unavailableEngine,
  worldOf,
} from './__fixtures__/run-sessions.fixture.js'

const Feature = makeFeature({ it })

const joined = <A, E>(handle: StepHandle<A, E>): Effect.Effect<A, E> => handle.join

const counts = (engine: CountedEngine) => Effect.all({ acquisitions: engine.acquisitions, closes: engine.closes })

const pureBody = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: [] })
  const engine = yield* countedEngine(GREET_SITE)
  const attempt = yield* inTry({
    world,
    retry: 0,
    engine: engine.source,
    body: (session) => Effect.andThen(Effect.succeed(12.5), session.endAttempt({ _tag: 'Finished', errors: [] })),
  })
  return {
    attempt: Match.valueTags(attempt, { Ran: ({ status }) => status, Skipped: ({ reason }) => reason }),
    ...(yield* counts(engine)),
  }
})

const openThenTwoActs = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: [done('first'), done('second')] })
  const engine = yield* countedEngine(GREET_SITE)
  yield* inTry({
    world,
    retry: 0,
    engine: engine.source,
    body: (session) =>
      Effect.gen(function*() {
        yield* session.open('/').pipe(Effect.flatMap(joined))
        yield* session.act({ instruction: 'look at the welcome' }).pipe(Effect.flatMap(joined))
        yield* session.act({ instruction: 'look at the title' }).pipe(Effect.flatMap(joined))
        return yield* session.endAttempt({ _tag: 'Finished', errors: [] })
      }),
  })
  return yield* counts(engine)
})

const environmentDown = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: [] })
  const engine = yield* unavailableEngine
  const attempt = yield* inTry({
    world,
    retry: 0,
    engine: engine.source,
    body: (session) =>
      Effect.gen(function*() {
        yield* session.open('/').pipe(Effect.flatMap(joined), Effect.result)
        yield* session.act({ instruction: 'press Greet' }).pipe(Effect.flatMap(joined), Effect.result)
        return yield* session.endAttempt({ _tag: 'Finished', errors: [] })
      }),
  })
  return {
    attempt: Match.valueTags(attempt, {
      Ran: ({ status, errors, steps }) => ({ status, errors: errors.map((error) => error.code), steps: steps.length }),
      Skipped: ({ reason }) => ({ skipped: reason }),
    }),
    acquisitions: yield* engine.acquisitions,
  }
})

Feature('Opening the engine only when a test uses the app')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A test that never uses the app or the screen opens no browser',
      Gherkin.Do.pipe(
        When('the body computes a plain value and returns')('state', () => pureBody),
        Then('the try passes and the counting engine stays at zero opens and zero closes')((s, expect) =>
          expect(s.state).toEqual({ attempt: 'passed', acquisitions: 0, closes: 0 })
        ),
      ),
    )

    scenario(
      'A test that opens the app and acts twice opens the engine once and closes it once',
      Gherkin.Do.pipe(
        When('the body opens the home page and runs two acts')('state', () => openThenTwoActs),
        Then('the engine was opened once and closed once')((s, expect) =>
          expect(s.state).toEqual({ acquisitions: 1, closes: 1 })
        ),
      ),
    )

    scenario(
      'An engine that cannot start blocks the try with one environment failure',
      Gherkin.Do.pipe(
        When('the browser cannot start and the body opens the app and then acts')('state', () => environmentDown),
        Then('the try is blocked once with ENVIRONMENT_UNAVAILABLE although two steps needed the engine')(
          (s, expect) =>
            expect(s.state).toEqual({
              attempt: { status: 'blocked', errors: ['ENVIRONMENT_UNAVAILABLE'], steps: 0 },
              acquisitions: 1,
            }),
        ),
      ),
    )
  })
