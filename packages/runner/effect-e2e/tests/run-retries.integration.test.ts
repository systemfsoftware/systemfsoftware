import { secrets } from '@systemfsoftware/effect-e2e'
import type { ModelAnswer } from '@systemfsoftware/effect-e2e/model'
import type { Attempt } from '@systemfsoftware/effect-e2e/report'
import type { StepHandle, TestSessionShape } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Predicate from 'effect/Predicate'
import * as Redacted from 'effect/Redacted'

import { done, fillSecret, GREET_SITE, screenshot, SIGN_IN_SITE } from './__fixtures__/agent-sites.fixture.js'
import { hasImageOf, proposeCause, resolveCheck } from './__fixtures__/judgment-sites.fixture.js'
import { countedEngine, inTry, type World, worldOf } from './__fixtures__/run-sessions.fixture.js'

const Feature = makeFeature({ it })

const greetingContains = (value: string): ModelAnswer =>
  resolveCheck({
    combine: 'all',
    literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value }],
  })

const shapeOf = (attempt: Attempt) =>
  Match.valueTags(attempt, {
    Ran: (ran) => ({
      id: ran.id,
      retry: ran.retry,
      status: ran.status,
      steps: ran.steps.map((step) => [
        step.id,
        Predicate.isTagged(step, 'AssertStep') ? 'assert' : 'other',
        Predicate.isTagged(step.outcome, 'Failed') ? step.outcome.code : 'not failed',
      ]),
      errors: ran.errors.map((error) => error.code),
    }),
    Skipped: ({ reason }) => ({ skipped: reason }),
  })

const joined = <A, E>(handle: StepHandle<A, E>): Effect.Effect<A, E> => handle.join

const ended = (session: TestSessionShape) => session.endAttempt({ _tag: 'Finished', errors: [] })

const assertTry = (world: World, retry: number, statement: string) =>
  Effect.gen(function*() {
    const engine = yield* countedEngine(GREET_SITE)
    return yield* inTry({
      world,
      retry,
      engine: engine.source,
      body: (session) =>
        Effect.gen(function*() {
          yield* session.open('/greeted').pipe(Effect.flatMap(joined))
          yield* session.assert({ statement }).pipe(Effect.flatMap(joined), Effect.result)
          return yield* ended(session)
        }),
    })
  })

const failThenPass = Effect.gen(function*() {
  const world = yield* worldOf({
    mode: 'read-write',
    answers: [
      greetingContains('Goodbye'),
      proposeCause({ cause: 'product', evidence: [{ ref: 'hello' }], reason: 'the greeting does not say goodbye' }),
      greetingContains('Hello'),
    ],
  })
  yield* assertTry(world, 0, 'the greeting says goodbye')
  yield* assertTry(world, 1, 'the greeting says hello')
  const verdict = yield* world.log.verdict
  return {
    attempts: (yield* world.log.entries).map((entry) => shapeOf(entry.attempt)),
    verdict: [verdict.status, verdict.exitCode],
  }
})

const SECRET_LEDGER = { pw: Redacted.make('hunter2-507-retry') }

const actTry = (world: World, retry: number, site: typeof GREET_SITE, instruction: string) =>
  Effect.gen(function*() {
    const engine = yield* countedEngine(site)
    return yield* inTry({
      world,
      retry,
      engine: engine.source,
      secrets: SECRET_LEDGER,
      body: (session) =>
        Effect.gen(function*() {
          yield* session.open('/').pipe(Effect.flatMap(joined))
          yield* session.act({ instruction, params: { password: secrets.get('pw') } }).pipe(
            Effect.flatMap(joined),
            Effect.result,
          )
          return yield* ended(session)
        }),
    })
  })

const secretThenScreenshot = Effect.gen(function*() {
  const world = yield* worldOf({
    mode: 'read-write',
    answers: [fillSecret({ ref: 'password', secret: 'pw' }), done('typed the password'), screenshot, done('looked')],
  })
  const first = yield* actTry(world, 0, SIGN_IN_SITE, 'type the password')
  const second = yield* actTry(world, 1, GREET_SITE, 'look at the welcome page')
  const requests = yield* world.requests
  return {
    statuses: [first, second].map((attempt) => shapeOf(attempt)).map((shape) =>
      'status' in shape ? shape.status : shape
    ),
    imageAfterScreenshot: requests.slice(3).some(hasImageOf),
  }
})

Feature('Retrying a test as separate attempts')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A test that fails and then passes on retry is listed as two attempts and passes the run',
      Gherkin.Do.pipe(
        When('the first try asserts the greeting says goodbye and the retry asserts it says hello')(
          'state',
          () => failThenPass,
        ),
        Then(
          'the log lists a failed attempt-0 and a passed attempt-1, each numbering its own steps, and the run exits 0',
        )(
          (s, expect) =>
            expect(s.state).toEqual({
              attempts: [
                {
                  id: 'attempt-0',
                  retry: 0,
                  status: 'failed',
                  steps: [['step-2', 'assert', 'ASSERTION_FAILED']],
                  errors: [],
                },
                {
                  id: 'attempt-1',
                  retry: 1,
                  status: 'passed',
                  steps: [['step-2', 'assert', 'not failed']],
                  errors: [],
                },
              ],
              verdict: ['passed', 0],
            }),
        ),
      ),
    )

    scenario(
      'A secret typed in one try does not refuse a screenshot in the next',
      Gherkin.Do.pipe(
        When('the first try fills the password and the retry asks for a screenshot')(
          'state',
          () => secretThenScreenshot,
        ),
        Then('both tries pass and the retry shows the model the screenshot')((s, expect) =>
          expect(s.state).toEqual({ statuses: ['passed', 'passed'], imageAfterScreenshot: true })
        ),
      ),
    )
  })
