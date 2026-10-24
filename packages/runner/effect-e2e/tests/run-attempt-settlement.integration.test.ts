import type { StoreMode } from '@systemfsoftware/effect-e2e/cache'
import type { ModelAnswer } from '@systemfsoftware/effect-e2e/model'
import type { Attempt } from '@systemfsoftware/effect-e2e/report'
import type { StepHandle, TestSessionShape, TryEnding } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Predicate from 'effect/Predicate'

import { done, GREET_SITE, tap } from './__fixtures__/agent-sites.fixture.js'
import { proposeCause, resolveCheck } from './__fixtures__/judgment-sites.fixture.js'
import {
  countedEngine,
  EXTRACTS_GREETING,
  GREETING_SCHEMA,
  inTry,
  type World,
  worldOf,
} from './__fixtures__/run-sessions.fixture.js'
import { D1, E1, entryOf } from './__fixtures__/trace-entries.fixture.js'

const Feature = makeFeature({ it })

const SEEDED = D1

const greetingContains = (value: string): ModelAnswer =>
  resolveCheck({
    combine: 'all',
    literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value }],
  })

const PRESS_GREET: ReadonlyArray<ModelAnswer> = [tap('greet'), done('greeted Ada')]
const HOLDS: ReadonlyArray<ModelAnswer> = [greetingContains('Hello')]
const FAILS: ReadonlyArray<ModelAnswer> = [
  greetingContains('Goodbye'),
  proposeCause({ cause: 'product', evidence: [{ ref: 'hello' }], reason: 'the greeting does not say goodbye' }),
]

const joined = <A, E>(handle: StepHandle<A, E>): Effect.Effect<A, E> => handle.join

const FINISHED: TryEnding = { _tag: 'Finished', errors: [] }

type Body = (session: TestSessionShape, world: World) => Effect.Effect<void>

const actThenAssert = (statement: string): Body => (session) =>
  Effect.gen(function*() {
    yield* session.open('/').pipe(Effect.flatMap(joined), Effect.ignore)
    yield* session.act({ instruction: 'press Greet' }).pipe(Effect.flatMap(joined), Effect.ignore)
    yield* session.assert({ statement }).pipe(Effect.flatMap(joined), Effect.ignore)
  })

const unawaitedAct: Body = (session, world) =>
  Effect.gen(function*() {
    yield* session.open('/').pipe(Effect.flatMap(joined), Effect.ignore)
    yield* session.act({ instruction: 'press Greet' })
    yield* world.drained
  })

const openMissing: Body = (session) => session.open('/missing').pipe(Effect.flatMap(joined), Effect.ignore)

const actAssertExtract: Body = (session, world) =>
  Effect.andThen(
    actThenAssert('the greeting says hello')(session, world),
    session.extract({ instruction: 'read the greeting', schema: GREETING_SCHEMA }).pipe(
      Effect.flatMap(joined),
      Effect.ignore,
    ),
  )

const modelStepsOf = (attempt: Attempt) =>
  Match.valueTags(attempt, {
    Ran: ({ steps }) =>
      steps.flatMap((step) =>
        Match.valueTags(step, {
          ActStep: ({ cache, modelCalls, tokens }) => [['act', cache, modelCalls, tokens]],
          AssertStep: ({ cache, modelCalls, tokens }) => [['assert', cache, modelCalls, tokens]],
          WaitForStep: ({ cache, modelCalls, tokens }) => [['waitFor', cache, modelCalls, tokens]],
          ExtractStep: ({ cache, modelCalls, tokens }) => [['extract', cache, modelCalls, tokens]],
          LocatorStep: () => [],
          ValueStep: () => [],
        })
      ),
    Skipped: () => [],
  })

const writesOf = (attempt: Attempt) =>
  Match.valueTags(attempt, {
    Ran: ({ status, errors, steps }) => ({
      status,
      errors: errors.map((error) => error.code),
      writes: steps.flatMap((step) => Predicate.isTagged(step, 'ActStep') ? [step.cache.write] : []),
    }),
    Skipped: ({ reason }) => ({ skipped: reason }),
  })

interface TryInput {
  readonly mode: StoreMode
  readonly answers: ReadonlyArray<ModelAnswer>
  readonly body: Body
  readonly ending?: TryEnding
  readonly seeded?: boolean
  readonly failingStore?: boolean
}

const triedOnce = (input: TryInput) =>
  Effect.gen(function*() {
    const world = yield* worldOf({
      mode: input.mode,
      answers: input.answers,
      seed: input.seeded === true ? [[SEEDED, yield* entryOf(E1)]] : [],
      failingStore: input.failingStore ?? false,
    })
    const engine = yield* countedEngine(GREET_SITE)
    const attempt = yield* inTry({
      world,
      retry: 0,
      engine: engine.source,
      body: (session) => Effect.andThen(input.body(session, world), session.endAttempt(input.ending ?? FINISHED)),
    })
    return { attempt, world, engine }
  })

const settledAfter = (input: TryInput) =>
  Effect.gen(function*() {
    const { attempt, world, engine } = yield* triedOnce(input)
    const stored = yield* world.store.digests
    const acquisitions = yield* engine.acquisitions
    return {
      attempt: writesOf(attempt),
      stored: stored.length,
      seededKept: stored.includes(SEEDED),
      balanced: acquisitions === (yield* engine.closes) && acquisitions <= 1,
    }
  })

Feature('Settling the replay cache and recording the attempt on every ending')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'An act confirmed by a passing assertion saves both recordings',
      Gherkin.Do.pipe(
        When('the try presses Greet and asserts the greeting says hello in read-write mode')(
          'state',
          () =>
            settledAfter({
              mode: 'read-write',
              answers: [...PRESS_GREET, ...HOLDS],
              body: actThenAssert('the greeting says hello'),
            }),
        ),
        Then('the try passes, the act is saved and the store holds both entries')((s, expect) =>
          expect(s.state).toEqual({
            attempt: { status: 'passed', errors: [], writes: ['saved'] },
            stored: 2,
            seededKept: false,
            balanced: true,
          })
        ),
      ),
    )

    scenario(
      'An act followed by a failing assertion saves nothing',
      Gherkin.Do.pipe(
        When('the try presses Greet and asserts the greeting says goodbye')(
          'state',
          () =>
            settledAfter({
              mode: 'read-write',
              answers: [...PRESS_GREET, ...FAILS],
              body: actThenAssert('the greeting says goodbye'),
            }),
        ),
        Then('the try fails, the act is unconfirmed and the store stays empty')((s, expect) =>
          expect(s.state).toEqual({
            attempt: { status: 'failed', errors: [], writes: ['unconfirmed'] },
            stored: 0,
            seededKept: false,
            balanced: true,
          })
        ),
      ),
    )

    scenario(
      'An act the body never awaited saves nothing',
      Gherkin.Do.pipe(
        When('the try starts an act and returns once the model has answered')(
          'state',
          () => settledAfter({ mode: 'read-write', answers: PRESS_GREET, body: unawaitedAct }),
        ),
        Then('the try fails STEP_NOT_AWAITED and the store stays empty')((s, expect) =>
          expect({ status: s.state.attempt, stored: s.state.stored, balanced: s.state.balanced }).toMatchObject({
            status: { status: 'failed', errors: ['STEP_NOT_AWAITED'] },
            stored: 0,
            balanced: true,
          })
        ),
      ),
    )

    scenario(
      'Opening a page the app does not serve blocks the try',
      Gherkin.Do.pipe(
        When('the try opens a path the site does not serve')(
          'state',
          () => settledAfter({ mode: 'read-write', answers: [], body: openMissing }),
        ),
        Then('the try is blocked with APP_UNREACHABLE and the engine is still closed')((s, expect) =>
          expect(s.state).toEqual({
            attempt: { status: 'blocked', errors: ['APP_UNREACHABLE'], writes: [] },
            stored: 0,
            seededKept: false,
            balanced: true,
          })
        ),
      ),
    )

    scenario(
      'A cancelled try leaves the cache exactly as it was',
      Gherkin.Do.pipe(
        When('the try passes an act and an assertion and is then cancelled, with one entry already stored')(
          'state',
          () =>
            settledAfter({
              mode: 'read-write',
              answers: [...PRESS_GREET, ...HOLDS],
              body: actThenAssert('the greeting says hello'),
              ending: { _tag: 'Cancelled' },
              seeded: true,
            }),
        ),
        Then('the try is interrupted, nothing is written and the stored entry is kept')((s, expect) =>
          expect(s.state).toEqual({
            attempt: { status: 'interrupted', errors: ['INTERRUPTED'], writes: ['no-change'] },
            stored: 1,
            seededKept: true,
            balanced: true,
          })
        ),
      ),
    )

    scenario(
      'A read-only cache records nothing even after a passing try',
      Gherkin.Do.pipe(
        When('the try passes an act and an assertion against a read-only cache')(
          'state',
          () =>
            settledAfter({
              mode: 'read-only',
              answers: [...PRESS_GREET, ...HOLDS],
              body: actThenAssert('the greeting says hello'),
            }),
        ),
        Then('the try passes and the store stays empty')((s, expect) =>
          expect(s.state).toEqual({
            attempt: { status: 'passed', errors: [], writes: ['no-change'] },
            stored: 0,
            seededKept: false,
            balanced: true,
          })
        ),
      ),
    )

    scenario(
      'A cache store that cannot write leaves the verdict alone',
      Gherkin.Do.pipe(
        When('the try passes an act and an assertion while every cache write fails')(
          'state',
          () =>
            settledAfter({
              mode: 'read-write',
              answers: [...PRESS_GREET, ...HOLDS],
              body: actThenAssert('the greeting says hello'),
              failingStore: true,
            }),
        ),
        Then('the try still passes and the act records that its recording was not written')((s, expect) =>
          expect(s.state).toEqual({
            attempt: { status: 'passed', errors: [], writes: ['not-written'] },
            stored: 0,
            seededKept: false,
            balanced: true,
          })
        ),
      ),
    )

    scenario(
      'Every model-driven step keeps its cache decision, model calls and tokens',
      Gherkin.Do.pipe(
        When('the try presses Greet, asserts the greeting says hello and extracts the greeting in read-write mode')(
          'steps',
          () =>
            Effect.map(
              triedOnce({
                mode: 'read-write',
                answers: [...PRESS_GREET, ...HOLDS, EXTRACTS_GREETING],
                body: actAssertExtract,
              }),
              ({ attempt }) => modelStepsOf(attempt),
            ),
        ),
        Then(
          'the act and the assert missed the cache and were saved, the extract never used it, and each reports its own calls and tokens',
        )((s, expect) =>
          expect(s.steps).toEqual([
            ['act', { lookup: { _tag: 'Missed' }, write: 'saved' }, 2, { input: 200, output: 20 }],
            ['assert', { lookup: { _tag: 'Missed' }, write: 'saved' }, 1, { input: 100, output: 10 }],
            ['extract', { lookup: { _tag: 'Off' }, write: 'no-change' }, 1, { input: 100, output: 10 }],
          ])
        ),
      ),
    )
  })
