import type { Attempt } from '@systemfsoftware/effect-e2e'
import type { TestSessionShape } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Predicate from 'effect/Predicate'

import { done, GREET_SITE, tap } from './__fixtures__/agent-sites.fixture.js'
import { countedEngine, hangingGateway, inTry, worldOf } from './__fixtures__/run-sessions.fixture.js'

const Feature = makeFeature({ it })

const shapeOf = (attempt: Attempt) =>
  Match.valueTags(attempt, {
    Ran: (ran) => ({
      status: ran.status,
      steps: ran.steps.map((step) => [
        step.id,
        Predicate.isTagged(step, 'ActStep') ? 'act' : 'other',
        Predicate.isTagged(step.outcome, 'Passed') ? 'passed' : 'not passed',
      ]),
      errors: ran.errors.map((error) => [error.code, error.cause, error.evidence.map((ref) => JSON.stringify(ref))]),
    }),
    Skipped: ({ reason }) => ({ skipped: reason }),
  })

/** Opens the greeting app's home page and awaits it, as every act below starts from there. */
const home = (session: TestSessionShape) => Effect.flatMap(session.open('/'), (handle) => handle.join)

const hangingAct = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: [] })
  const hanging = yield* hangingGateway
  const engine = yield* countedEngine(GREET_SITE)
  const { attempt, handleExit } = yield* inTry({
    world: { ...world, gateway: hanging.layer },
    retry: 0,
    engine: engine.source,
    body: (session) =>
      Effect.gen(function*() {
        yield* home(session)
        const handle = yield* session.act({ instruction: 'press Greet' })
        yield* hanging.asked
        const ended = yield* session.endAttempt({ _tag: 'Finished', errors: [] })
        return { attempt: ended, handleExit: yield* Effect.exit(handle.join) }
      }),
  })
  return {
    attempt: shapeOf(attempt),
    interrupted: Exit.hasInterrupts(handleExit),
    acquisitions: yield* engine.acquisitions,
    closes: yield* engine.closes,
  }
})

const finishedUnjoinedAct = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: [tap('greet'), done('greeted Ada')] })
  const engine = yield* countedEngine(GREET_SITE)
  return yield* inTry({
    world,
    retry: 0,
    engine: engine.source,
    body: (session) =>
      Effect.gen(function*() {
        yield* home(session)
        yield* session.act({ instruction: 'press Greet' })
        yield* world.drained
        return Match.valueTags(yield* session.endAttempt({ _tag: 'Finished', errors: [] }), {
          Ran: (ran) => ({ status: ran.status, errors: ran.errors.map((error) => error.code) }),
          Skipped: ({ reason }) => ({ skipped: reason }),
        })
      }),
  })
})

const bothJoined = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: [done('first'), done('second')] })
  const engine = yield* countedEngine(GREET_SITE)
  return yield* inTry({
    world,
    retry: 0,
    engine: engine.source,
    body: (session) =>
      Effect.gen(function*() {
        yield* home(session)
        const first = yield* session.act({ instruction: 'look at the welcome' })
        const second = yield* session.act({ instruction: 'look at the title' })
        yield* first.join
        yield* second.join
        return shapeOf(yield* session.endAttempt({ _tag: 'Finished', errors: [] }))
      }),
  })
})

const unjoinedOpen = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: [] })
  const engine = yield* countedEngine(GREET_SITE)
  return yield* inTry({
    world,
    retry: 0,
    engine: engine.source,
    body: (session) =>
      Effect.gen(function*() {
        yield* session.open('/')
        return shapeOf(yield* session.endAttempt({ _tag: 'Finished', errors: [] }))
      }),
  })
})

const unawaited = (text: string) => [
  'STEP_NOT_AWAITED',
  'automation',
  [JSON.stringify({ _tag: 'LogEvidence', text })],
]

Feature('Failing a try that returns before its steps are awaited')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A test returning while agent.act runs fails STEP_NOT_AWAITED and interrupts the act',
      Gherkin.Do.pipe(
        When('the body starts an act, the model is asked, and the body returns without awaiting it')(
          'state',
          () => hangingAct,
        ),
        Then(
          'the try fails with one unawaited act, the act fiber is interrupted, and the engine opened once and closed once',
        )(
          (s, expect) =>
            expect(s.state).toEqual({
              attempt: {
                status: 'failed',
                steps: [],
                errors: [unawaited('act "press Greet" was started and not awaited before the test returned')],
              },
              interrupted: true,
              acquisitions: 1,
              closes: 1,
            }),
        ),
      ),
    )

    scenario(
      'An act the body never awaits fails the try even after the model reported done',
      Gherkin.Do.pipe(
        When('the body starts an act, the model taps Greet and reports done, and the body never awaits it')(
          'state',
          () => finishedUnjoinedAct,
        ),
        Then('the try fails with exactly one STEP_NOT_AWAITED for that act')((s, expect) =>
          expect(s.state).toEqual({ status: 'failed', errors: ['STEP_NOT_AWAITED'] })
        ),
      ),
    )

    scenario(
      'Two acts started together and both awaited pass',
      Gherkin.Do.pipe(
        When('the body starts two acts and then awaits each')('state', () => bothJoined),
        Then('the try passes with both steps in launch order and no attempt failure')((s, expect) =>
          expect(s.state).toEqual({
            status: 'passed',
            steps: [['step-2', 'act', 'passed'], ['step-3', 'act', 'passed']],
            errors: [],
          })
        ),
      ),
    )

    scenario(
      'An open that was never awaited fails the try naming the path',
      Gherkin.Do.pipe(
        When('the body opens "/" and never awaits it')('state', () => unjoinedOpen),
        Then('the try fails STEP_NOT_AWAITED naming open and its path')((s, expect) =>
          expect(s.state).toEqual({
            status: 'failed',
            steps: [],
            errors: [unawaited('open "/" was started and not awaited before the test returned')],
          })
        ),
      ),
    )
  })
