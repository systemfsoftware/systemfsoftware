import { secrets } from '@systemfsoftware/effect-e2e'
import type { MemorySite, SemanticNode } from '@systemfsoftware/effect-e2e/engine'
import type { ModelAnswer } from '@systemfsoftware/effect-e2e/model'
import type { Attempt } from '@systemfsoftware/effect-e2e/report'
import type { StepHandle, TestSessionShape, TryEnding } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import { TestClock } from 'effect/testing'

import {
  done,
  fillSecret,
  GREET_SITE,
  ORIGIN,
  RENAMED_SITE,
  SIGN_IN_SITE,
  tap,
} from './__fixtures__/agent-sites.fixture.js'
import { proposeCause, resolveCheck } from './__fixtures__/judgment-sites.fixture.js'
import { capturingEngine, type CountedEngine, inTry, type World, worldOf } from './__fixtures__/run-sessions.fixture.js'

const Feature = makeFeature({ it })

const SHOWN = 'tok-508-shown'
const TYPED = 'hunter2-508-typed'

const nodeOf = (id: string, role: string, name: string): SemanticNode => ({
  ref: { id, revision: '1' },
  role,
  name,
  states: { disabled: false, hidden: false },
  children: [],
})

/** A page that shows a held secret as plain text beside the greeting, and logged a console error. */
const SECRET_SHOWN_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web', 'screenshot'],
  pages: {
    '/': {
      tree: [nodeOf('hello', 'heading', 'Hello, Ada'), nodeOf('token', 'text', SHOWN)],
      links: {},
      logs: [{ _tag: 'Console', level: 'error', text: 'the greeting service answered 500' }],
    },
  },
}

const textContains = (ref: string, value: string): ModelAnswer =>
  resolveCheck({ combine: 'all', literals: [{ predicate: 'text', target: { ref }, match: 'contains', value }] })

const PRODUCT_CAUSE = proposeCause({
  cause: 'product',
  evidence: [{ ref: 'hello' }],
  reason: 'it does not say goodbye',
})

const joined = <A, E>(handle: StepHandle<A, E>): Effect.Effect<A, E> => handle.join

const FINISHED: TryEnding = { _tag: 'Finished', errors: [] }

const statusOf = (attempt: Attempt): string =>
  Match.valueTags(attempt, { Ran: ({ status }) => status, Skipped: () => 'skipped' })

const errorCodesOf = (attempt: Attempt): ReadonlyArray<string> =>
  Match.valueTags(attempt, { Ran: ({ errors }) => Arr.dedupe(errors.map((error) => error.code)), Skipped: () => [] })

const textOf = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

interface Evidence {
  readonly status: string
  readonly errors: ReadonlyArray<string>
  readonly files: Readonly<Record<string, string>>
}

/** The last try's status, its run-level error codes, and every file its entry lists, read back as text by kind. */
const evidenceOf = (world: World): Effect.Effect<Evidence> =>
  Effect.gen(function*() {
    const entries = yield* world.log.entries
    const last = yield* Arr.last(entries).pipe(Effect.fromOption, Effect.orDie)
    const files = yield* Effect.forEach(last.artifacts, (ref) =>
      Effect.map(
        world.artifacts.read(ref.path),
        (bytes) => [ref.kind, Option.match(bytes, { onNone: () => '<missing>', onSome: textOf })] as const,
      ))
    return { status: statusOf(last.attempt), errors: errorCodesOf(last.attempt), files: Object.fromEntries(files) }
  })

const kindsOf = (evidence: Evidence): ReadonlyArray<string> => Object.keys(evidence.files).toSorted()

const assertGoodbye = (session: TestSessionShape) =>
  Effect.gen(function*() {
    yield* session.open('/').pipe(Effect.flatMap(joined))
    yield* session.assert({ statement: 'the greeting says goodbye' }).pipe(Effect.flatMap(joined), Effect.result)
    return yield* session.endAttempt(FINISHED)
  })

const secretOnScreen = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: [textContains('hello', 'Goodbye'), PRODUCT_CAUSE] })
  const engine = yield* capturingEngine({ site: SECRET_SHOWN_SITE })
  yield* inTry({
    world,
    retry: 0,
    engine: engine.source,
    secrets: { token: Redacted.make(SHOWN) },
    body: assertGoodbye,
  })
  const evidence = yield* evidenceOf(world)
  const trace = evidence.files['trace-page'] ?? ''
  const screen = evidence.files['screen-text'] ?? ''
  return {
    evidence,
    facts: {
      status: evidence.status,
      kinds: kindsOf(evidence),
      masksPerScreenshot: (yield* engine.screenshots).map((request) => request.mask.length),
      screenMasksSecret: screen.includes('[secret:token]') && !screen.includes(SHOWN),
      traceNamesFailingStep: trace.includes('### step-2: AssertStep failed `ASSERTION_FAILED` (product)'),
      traceNamesCacheDecision: /- Cache: missed, write [a-z-]+/u.test(trace),
      traceShowsScreen: trace.includes(screen),
      traceShowsConsoleError: trace.includes('[console:error] the greeting service answered 500'),
    },
  }
})

const filledThenBlocked = Effect.gen(function*() {
  const world = yield* worldOf({
    mode: 'read-write',
    answers: [fillSecret({ ref: 'password', secret: 'pw' }), done('typed the password')],
  })
  const engine = yield* capturingEngine({ site: SIGN_IN_SITE })
  yield* inTry({
    world,
    retry: 0,
    engine: engine.source,
    secrets: { pw: Redacted.make(TYPED) },
    body: (session) =>
      Effect.gen(function*() {
        yield* session.open('/').pipe(Effect.flatMap(joined))
        yield* session.act({ instruction: 'type the password', params: { password: secrets.get('pw') } }).pipe(
          Effect.flatMap(joined),
          Effect.result,
        )
        yield* session.open('/missing').pipe(Effect.flatMap(joined), Effect.result)
        return yield* session.endAttempt(FINISHED)
      }),
  })
  const evidence = yield* evidenceOf(world)
  return {
    evidence,
    facts: {
      status: evidence.status,
      kinds: kindsOf(evidence),
      screenshotsAsked: (yield* engine.screenshots).length,
      traceSaysPolicyRefused: (evidence.files['trace-page'] ?? '').includes(
        'Screenshot not taken: a screenshot after a secret fill could show the secret',
      ),
    },
  }
})

const greetTry = <E>(
  input: { readonly world: World; readonly engine: CountedEngine },
  body: (session: TestSessionShape) => Effect.Effect<Attempt, E>,
) => inTry({ world: input.world, retry: 0, engine: input.engine.source, body })

const passing = (session: TestSessionShape) =>
  Effect.andThen(session.open('/').pipe(Effect.flatMap(joined), Effect.result), session.endAttempt(FINISHED))

const blocked = (session: TestSessionShape) =>
  Effect.gen(function*() {
    yield* session.open('/').pipe(Effect.flatMap(joined), Effect.result)
    yield* session.open('/missing').pipe(Effect.flatMap(joined), Effect.result)
    return yield* session.endAttempt(FINISHED)
  })

const admittedBy = (input: { readonly trace: 'off' | 'on' | 'retain-on-failure'; readonly passes: boolean }) =>
  Effect.gen(function*() {
    const world = yield* worldOf({ mode: 'read-write', answers: [], trace: input.trace })
    const engine = yield* capturingEngine({ site: GREET_SITE })
    yield* greetTry({ world, engine }, input.passes ? passing : blocked)
    const evidence = yield* evidenceOf(world)
    return [evidence.status, kindsOf(evidence)]
  })

const neverOpened = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: [] })
  const engine = yield* capturingEngine({ site: GREET_SITE })
  yield* greetTry({ world, engine }, (session) =>
    session.endAttempt({
      _tag: 'Finished',
      errors: [{ code: 'INTERNAL_ERROR', cause: 'unclassified', evidence: [{ _tag: 'LogEvidence', text: 'boom' }] }],
    }))
  const evidence = yield* evidenceOf(world)
  return {
    status: evidence.status,
    kinds: kindsOf(evidence),
    traceSaysNeverOpened: (evidence.files['trace-page'] ?? '').includes('the engine was never opened in this try'),
    acquisitions: yield* engine.acquisitions,
  }
})

const pressSecond = (path: string) => (session: TestSessionShape) =>
  Effect.gen(function*() {
    yield* session.open(path).pipe(Effect.flatMap(joined))
    yield* session.act({ instruction: 'press the second button' }).pipe(Effect.flatMap(joined), Effect.result)
  })

const failedReplay = Effect.gen(function*() {
  const world = yield* worldOf({
    mode: 'read-write',
    answers: [
      tap('next'),
      done('pressed Continue'),
      textContains('done', 'All done'),
      tap('next'),
      done('pressed Next'),
      textContains('done', 'Goodbye'),
      proposeCause({ cause: 'product', evidence: [{ ref: 'done' }], reason: 'the page does not say goodbye' }),
    ],
  })
  const recorded = yield* capturingEngine({ site: GREET_SITE })
  yield* greetTry({ world, engine: recorded }, (session) =>
    Effect.gen(function*() {
      yield* pressSecond('/greeted')(session)
      yield* session.assert({ statement: 'the page says all done' }).pipe(Effect.flatMap(joined), Effect.result)
      return yield* session.endAttempt(FINISHED)
    }))
  const renamed = yield* capturingEngine({ site: RENAMED_SITE })
  yield* inTry({
    world,
    retry: 1,
    engine: renamed.source,
    body: (session) =>
      Effect.gen(function*() {
        yield* pressSecond('/greeted')(session)
        yield* session.assert({ statement: 'the page says goodbye' }).pipe(Effect.flatMap(joined), Effect.result)
        return yield* session.endAttempt(FINISHED)
      }),
  })
  const evidence = yield* evidenceOf(world)
  const trace = evidence.files['trace-page'] ?? ''
  return {
    status: evidence.status,
    traceNamesHandedOffAct: trace.includes('### step-2: ActStep passed') &&
      trace.includes('- Cache: handed off (ControlMissing)'),
    traceShowsScreenAtFailure: trace.includes('All done'),
  }
})

const hungScreenshot = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: [] })
  const engine = yield* capturingEngine({ site: GREET_SITE, hangs: true })
  yield* greetTry({ world, engine }, (session) =>
    Effect.gen(function*() {
      yield* session.open('/').pipe(Effect.flatMap(joined), Effect.result)
      yield* session.open('/missing').pipe(Effect.flatMap(joined), Effect.result)
      const ending = yield* Effect.forkChild(session.endAttempt(FINISHED))
      yield* engine.asked
      yield* TestClock.adjust('5 seconds')
      return yield* Fiber.join(ending)
    }))
  const evidence = yield* evidenceOf(world)
  return {
    status: evidence.status,
    kinds: kindsOf(evidence),
    traceSaysTimedOut: (evidence.files['trace-page'] ?? '').includes('the capture did not finish within 5s'),
  }
})

const refusedStore = Effect.gen(function*() {
  const failing = yield* worldOf({
    mode: 'read-write',
    answers: [textContains('hello', 'Goodbye'), PRODUCT_CAUSE],
    refusingArtifacts: true,
  })
  yield* greetTry({ world: failing, engine: yield* capturingEngine({ site: SECRET_SHOWN_SITE }) }, assertGoodbye)
  const passingOn = yield* worldOf({ mode: 'read-write', answers: [], trace: 'on', refusingArtifacts: true })
  yield* greetTry({ world: passingOn, engine: yield* capturingEngine({ site: GREET_SITE }) }, passing)
  return yield* Effect.forEach(
    [failing, passingOn],
    (world) => Effect.map(evidenceOf(world), (evidence) => [evidence.status, evidence.errors, kindsOf(evidence)]),
  )
})

const fileTextsOf = (evidence: Evidence): ReadonlyArray<string> => Object.values(evidence.files)

Feature('Leaving failure evidence at the end of a try')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A failed assertion on a screen that shows a secret leaves a masked screenshot, redacted screen text and a trace',
      Gherkin.Do.pipe(
        When('the try asserts the greeting says goodbye on a page that shows a held secret')(
          'state',
          () => secretOnScreen,
        ),
        Then(
          'the screenshot masks the one secret node, the screen text masks the value, and the trace names the failing step, its cache decision, the screen and the console error',
        )((s, expect) =>
          expect(s.state.facts).toEqual({
            status: 'failed',
            kinds: ['screen-text', 'screenshot', 'trace-page'],
            masksPerScreenshot: [1],
            screenMasksSecret: true,
            traceNamesFailingStep: true,
            traceNamesCacheDecision: true,
            traceShowsScreen: true,
            traceShowsConsoleError: true,
          })
        ),
      ),
    )

    scenario(
      'A try that filled a secret and then failed takes no screenshot and says why',
      Gherkin.Do.pipe(
        When('the try types the password and then opens a page the app does not serve')(
          'state',
          () => filledThenBlocked,
        ),
        Then('it is blocked, writes the screen text and the trace but no screenshot, and the trace names the policy')((
          s,
          expect,
        ) =>
          expect(s.state.facts).toEqual({
            status: 'blocked',
            kinds: ['screen-text', 'trace-page'],
            screenshotsAsked: 0,
            traceSaysPolicyRefused: true,
          })
        ),
      ),
    )

    scenario(
      'No evidence file carries a held secret value',
      Gherkin.Do.pipe(
        When('both secret scenarios run')(
          'state',
          () =>
            Effect.all([secretOnScreen, filledThenBlocked]).pipe(
              Effect.map(Arr.flatMap((run) => fileTextsOf(run.evidence))),
            ),
        ),
        Then('no file text contains either value')((s, expect) =>
          expect(s.state.filter((text) => text.includes(SHOWN) || text.includes(TYPED))).toEqual([])
        ),
      ),
    )

    scenario(
      'The trace setting and the try status decide whether evidence is written',
      Gherkin.Do.pipe(
        When('a passing try runs under each setting and a blocked try under each setting')(
          'state',
          () =>
            Effect.all([
              admittedBy({ trace: 'retain-on-failure', passes: true }),
              admittedBy({ trace: 'off', passes: false }),
              admittedBy({ trace: 'on', passes: true }),
              admittedBy({ trace: 'retain-on-failure', passes: false }),
            ]),
        ),
        Then('only a non-passing try under retain-on-failure and every try under on leave files')((s, expect) =>
          expect(s.state).toEqual([
            ['passed', []],
            ['blocked', []],
            ['passed', ['screen-text', 'screenshot', 'trace-page']],
            ['blocked', ['screen-text', 'screenshot', 'trace-page']],
          ])
        ),
      ),
    )

    scenario(
      'A failed try that never opened the screen writes only the trace, and opens no engine for it',
      Gherkin.Do.pipe(
        When('a try ends with a runner error before any step')('state', () => neverOpened),
        Then('the trace says the engine was never opened and nothing was acquired')((s, expect) =>
          expect(s.state).toEqual({
            status: 'error',
            kinds: ['trace-page'],
            traceSaysNeverOpened: true,
            acquisitions: 0,
          })
        ),
      ),
    )

    scenario(
      'A failed replay gets a trace naming the handed-off act and the screen at failure',
      Gherkin.Do.pipe(
        When('a recorded act replays against a renamed control and the assertion that follows fails')(
          'state',
          () => failedReplay,
        ),
        Then('the trace names the act, its handed-off lookup and the screen it failed on')((s, expect) =>
          expect(s.state).toEqual({ status: 'failed', traceNamesHandedOffAct: true, traceShowsScreenAtFailure: true })
        ),
      ),
    )

    scenario(
      'A screenshot that never answers gives up after five seconds and the try still ends',
      Gherkin.Do.pipe(
        When('a blocked try ends on an engine whose screenshot hangs and five seconds pass')(
          'state',
          () => hungScreenshot,
        ),
        Then('only the trace is written and it says the capture timed out')((s, expect) =>
          expect(s.state).toEqual({ status: 'blocked', kinds: ['trace-page'], traceSaysTimedOut: true })
        ),
      ),
    )

    scenario(
      'An evidence store that refuses every write is recorded on the attempt without hiding a failure',
      Gherkin.Do.pipe(
        When('a failing try and a passing try under trace on end against a refusing store')(
          'state',
          () => refusedStore,
        ),
        Then('the failing try stays failed and the passing try is blocked, both listing ARTIFACT_WRITE_FAILED')((
          s,
          expect,
        ) =>
          expect(s.state).toEqual([
            ['failed', ['ARTIFACT_WRITE_FAILED'], []],
            ['blocked', ['ARTIFACT_WRITE_FAILED'], []],
          ])
        ),
      ),
    )
  })
