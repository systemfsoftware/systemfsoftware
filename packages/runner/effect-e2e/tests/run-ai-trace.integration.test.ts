import { type ModelAnswer, ModelGateway, ModelProviderFailed } from '@systemfsoftware/effect-e2e/model'
import type { Attempt } from '@systemfsoftware/effect-e2e/report'
import type { StepHandle, TestSessionShape, TryEnding } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'

import { done, GREET_SITE, screenshot } from './__fixtures__/agent-sites.fixture.js'
import { TraceFile } from './__fixtures__/ai-trace-file.fixture.js'
import { proposeCause, resolveCheck } from './__fixtures__/judgment-sites.fixture.js'
import { capturingEngine, hangingGateway, inTry, type World, worldOf } from './__fixtures__/run-sessions.fixture.js'

const Feature = makeFeature({ it })

/** A held secret with a quote, a backslash and a non-ASCII letter, so its JSON-escaped form differs from it. */
const SECRET = 'pa"ss\\643-wörd'
const ESCAPED_SECRET = JSON.stringify(SECRET).slice(1, -1)
const MASK = '[secret:token]'

const FINISHED: TryEnding = { _tag: 'Finished', errors: [] }

const joined = <A, E>(handle: StepHandle<A, E>): Effect.Effect<A, E> => handle.join

const textOf = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

interface Written {
  readonly status: string
  readonly errors: ReadonlyArray<string>
  readonly kinds: ReadonlyArray<string>
  readonly paths: Readonly<Record<string, string>>
  readonly texts: Readonly<Record<string, string>>
}

const statusOf = (attempt: Attempt): string =>
  Match.valueTags(attempt, { Ran: ({ status }) => status, Skipped: () => 'skipped' })

const errorCodesOf = (attempt: Attempt): ReadonlyArray<string> =>
  Match.valueTags(attempt, { Ran: ({ errors }) => Arr.dedupe(errors.map((error) => error.code)), Skipped: () => [] })

/** The last try's status and error codes, and every file its log entry lists, read back by kind. */
const writtenOf = (world: World): Effect.Effect<Written> =>
  Effect.gen(function*() {
    const last = yield* Arr.last(yield* world.log.entries).pipe(Effect.fromOption, Effect.orDie)
    const texts = yield* Effect.forEach(last.artifacts, (ref) =>
      Effect.map(
        world.artifacts.read(ref.path),
        (bytes) => [ref.kind, Option.match(bytes, { onNone: () => '<missing>', onSome: textOf })] as const,
      ))
    return {
      status: statusOf(last.attempt),
      errors: errorCodesOf(last.attempt),
      kinds: last.artifacts.map((ref) => ref.kind).toSorted(),
      paths: Object.fromEntries(last.artifacts.map((ref) => [ref.kind, ref.path])),
      texts: Object.fromEntries(texts),
    }
  })

const traceOf = (written: Written): Effect.Effect<TraceFile> =>
  Effect.orDie(Schema.decodeEffect(TraceFile)(written.texts['ai-trace'] ?? ''))

/** Opens the home page, runs `step`, then opens a page the app does not serve, so the try ends blocked. */
const blockedAfter = <A, E>(step: (session: TestSessionShape) => Effect.Effect<A, E>) => (session: TestSessionShape) =>
  Effect.gen(function*() {
    yield* session.open('/').pipe(Effect.flatMap(joined))
    yield* step(session)
    yield* session.open('/missing').pipe(Effect.flatMap(joined), Effect.result)
    return yield* session.endAttempt(FINISHED)
  })

const actOn = (instruction: string) => (session: TestSessionShape) =>
  session.act({ instruction }).pipe(Effect.flatMap(joined), Effect.exit)

const greetTry = <E>(input: {
  readonly answers: ReadonlyArray<ModelAnswer>
  readonly aiTrace: boolean
  readonly trace?: 'off' | 'on' | 'retain-on-failure'
  readonly refusingArtifacts?: boolean
  readonly body: (session: TestSessionShape) => Effect.Effect<Attempt, E>
}) =>
  Effect.gen(function*() {
    const world = yield* worldOf({
      mode: 'read-write',
      answers: input.answers,
      aiTrace: input.aiTrace,
      ...(input.trace === undefined ? {} : { trace: input.trace }),
      ...(input.refusingArtifacts === true ? { refusingArtifacts: true } : {}),
    })
    const engine = yield* capturingEngine({ site: GREET_SITE })
    yield* inTry({
      world,
      retry: 0,
      engine: engine.source,
      secrets: { token: Redacted.make(SECRET) },
      body: input.body,
    })
    return { world, written: yield* writtenOf(world) }
  })

const plantedSecret = Effect.gen(function*() {
  const { written } = yield* greetTry({
    answers: [done(`greeted for ${SECRET}`)],
    aiTrace: true,
    body: blockedAfter(actOn(`press Greet for ${SECRET}`)),
  })
  const text = written.texts['ai-trace'] ?? ''
  const trace = yield* traceOf(written)
  const call = trace.calls[0]
  return {
    status: written.status,
    kinds: written.kinds,
    inResultDirectory: /^\.e2e\/results\/greets-[0-9a-f]{8}\/ai-trace\.json$/u.test(written.paths['ai-trace'] ?? ''),
    identity: [trace.schema, trace.test.title, trace.target, trace.agent, trace.retry],
    steps: trace.calls.map((each) => each.step),
    model: call?.request.model,
    offersDone: call?.request.tools.some((tool) => tool.name === 'done'),
    instructionMasked: JSON.stringify(call?.request.messages).includes(`press Greet for ${MASK}`),
    outcome: call?.outcome,
    secretBytes: text.includes(SECRET) || text.includes(ESCAPED_SECRET),
    masked: text.includes(MASK),
    pageLinksIt: (written.texts['trace-page'] ?? '').includes('ai-trace.json'),
  }
})

const assertWithCause = greetTry({
  answers: [
    resolveCheck({
      combine: 'all',
      literals: [{ predicate: 'text', target: { ref: 'title' }, match: 'contains', value: 'Goodbye' }],
    }),
    proposeCause({ cause: 'product', evidence: [{ ref: 'title' }], reason: 'it does not say goodbye' }),
  ],
  aiTrace: true,
  body: (session) =>
    Effect.gen(function*() {
      yield* session.open('/').pipe(Effect.flatMap(joined))
      yield* session.assert({ statement: 'the title says goodbye' }).pipe(Effect.flatMap(joined), Effect.result)
      return yield* session.endAttempt(FINISHED)
    }),
}).pipe(
  Effect.flatMap(({ written }) =>
    Effect.map(traceOf(written), (trace) => ({
      status: written.status,
      calls: trace.calls.map((call) => [call.step, call.request.tools.map((tool) => tool.name)]),
    }))
  ),
)

const kindsUnder = (input: {
  readonly aiTrace: boolean
  readonly trace: 'off' | 'on' | 'retain-on-failure'
  readonly passes: boolean
}) =>
  greetTry({
    answers: [done('greeted')],
    aiTrace: input.aiTrace,
    trace: input.trace,
    body: input.passes
      ? (session) =>
        Effect.gen(function*() {
          yield* session.open('/').pipe(Effect.flatMap(joined))
          yield* actOn('press Greet')(session)
          return yield* session.endAttempt(FINISHED)
        })
      : blockedAfter(actOn('press Greet')),
  }).pipe(Effect.map(({ written }) => [written.status, written.kinds]))

const noModelCall = greetTry({ answers: [], aiTrace: true, body: blockedAfter(() => Effect.void) }).pipe(
  Effect.flatMap(({ written }) => Effect.map(traceOf(written), (trace) => [written.status, trace.calls.length])),
)

const refusedStore = greetTry({
  answers: [done('greeted')],
  aiTrace: true,
  trace: 'off',
  refusingArtifacts: true,
  body: blockedAfter(actOn('press Greet')),
}).pipe(Effect.map(({ written }) => [written.status, written.errors, written.kinds]))

const FAILING_GATEWAY = Layer.succeed(
  ModelGateway,
  ModelGateway.of({
    complete: () =>
      Effect.fail(
        new ModelProviderFailed({
          message: 'the provider answered 503',
          evidence: [{ _tag: 'LogEvidence', text: 'HTTP 503' }],
        }),
      ),
  }),
)

const outcomeOfTry = <E>(input: {
  readonly world: World
  readonly body: (session: TestSessionShape) => Effect.Effect<Attempt, E>
}) =>
  Effect.gen(function*() {
    const engine = yield* capturingEngine({ site: GREET_SITE })
    yield* inTry({ world: input.world, retry: 0, engine: engine.source, body: input.body })
    const trace = yield* traceOf(yield* writtenOf(input.world))
    return trace.calls.map((call) => call.outcome)
  })

const everyOutcome = Effect.gen(function*() {
  const failing = yield* worldOf({ mode: 'read-write', answers: [], aiTrace: true })
  const failed = yield* outcomeOfTry({
    world: { ...failing, gateway: FAILING_GATEWAY },
    body: blockedAfter(actOn('press Greet')),
  })
  const died = yield* outcomeOfTry({
    world: yield* worldOf({ mode: 'read-write', answers: [], aiTrace: true }),
    body: blockedAfter(actOn('press Greet')),
  })
  const hanging = yield* hangingGateway
  const quiet = yield* worldOf({ mode: 'read-write', answers: [], aiTrace: true })
  const interrupted = yield* outcomeOfTry({
    world: { ...quiet, gateway: hanging.layer },
    body: (session) =>
      Effect.gen(function*() {
        yield* session.open('/').pipe(Effect.flatMap(joined))
        yield* session.act({ instruction: 'press Greet' })
        yield* hanging.asked
        return yield* session.endAttempt(FINISHED)
      }),
  })
  return {
    failed,
    diedNamesDefect: died.length === 1 &&
      JSON.stringify(died[0]).includes('Died') &&
      JSON.stringify(died[0]).includes('the scripted model has no answer left'),
    interrupted,
  }
})

const BASE64_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** The byte length of a base64 text, by an independent count: six bits per letter, padding carries none. */
const byteLengthOf = (base64: string): number =>
  Math.floor(Arr.filter(base64.split(''), (letter) => BASE64_LETTERS.includes(letter)).length * 6 / 8)

const imageElided = Effect.gen(function*() {
  const { world, written } = yield* greetTry({
    answers: [screenshot, done('looked')],
    aiTrace: true,
    body: blockedAfter(actOn('look at the page')),
  })
  const seen = yield* world.requests
  const sentImages = Arr.flatMap(
    seen,
    (request) =>
      Arr.flatMap(request.messages, (message) =>
        Match.valueTags(message, {
          UserMessage: ({ content }) =>
            Arr.flatMap(
              content,
              (part) => Match.valueTags(part, { TextPart: () => [], ImagePart: ({ data }) => [data] }),
            ),
          AssistantMessage: () => [],
          ToolMessage: () => [],
        })),
  )
  const trace = yield* traceOf(written)
  const text = written.texts['ai-trace'] ?? ''
  return {
    sentOneImage: sentImages.length,
    traced: JSON.stringify(trace.calls[1]?.request.messages).includes(
      JSON.stringify({ _tag: 'ImagePart', mediaType: 'image/png', bytes: byteLengthOf(sentImages[0] ?? '') }),
    ),
    dataAbsent: Arr.every(sentImages, (data) => !text.includes(data)),
  }
})

Feature("Writing a failed try's model calls to ai-trace.json")
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A failed try under ai-trace writes every model call with each held secret masked',
      Gherkin.Do.pipe(
        When('an act whose instruction and answer carry a held secret is followed by a page the app does not serve')(
          'state',
          () => plantedSecret,
        ),
        Then('ai-trace.json sits in the result directory, names the call, masks the secret and the page links it')((
          s,
          expect,
        ) =>
          expect(s.state).toEqual({
            status: 'blocked',
            kinds: ['ai-trace', 'screen-text', 'screenshot', 'trace-page'],
            inResultDirectory: true,
            identity: ['ai-trace-1', 'greets', 'web', 'default', 0],
            steps: ['step-2'],
            model: 'deepseek/deepseek-flash-latest',
            offersDone: true,
            instructionMasked: true,
            outcome: {
              _tag: 'Answered',
              answer: {
                _tag: 'ToolCalls',
                calls: [{ id: 'call-done', name: 'done', arguments: { summary: `greeted for ${MASK}` } }],
              },
              finishReason: 'tool_calls',
              usage: { input: 100, output: 10 },
              served: { provider: 'scripted', model: 'scripted-act-model' },
              latencyMillis: 1,
            },
            secretBytes: false,
            masked: true,
            pageLinksIt: true,
          })
        ),
      ),
    )

    scenario(
      "A failed assertion records the resolver's call and the cause classifier's call under its own step",
      Gherkin.Do.pipe(
        When('an assertion fails and the model proposes a product cause')('state', () => assertWithCause),
        Then('both calls carry the assert step and the one tool each was offered')((s, expect) =>
          expect(s.state).toEqual({
            status: 'failed',
            calls: [['step-2', ['resolve_check']], ['step-2', ['propose_cause']]],
          })
        ),
      ),
    )

    scenario(
      'The ai-trace setting and the try status decide whether ai-trace.json is written, whatever the trace setting',
      Gherkin.Do.pipe(
        When('tries run with and without ai-trace, passing and blocked, under several trace settings')(
          'state',
          () =>
            Effect.all([
              kindsUnder({ aiTrace: true, trace: 'off', passes: false }),
              kindsUnder({ aiTrace: true, trace: 'on', passes: true }),
              kindsUnder({ aiTrace: false, trace: 'retain-on-failure', passes: false }),
            ]),
        ),
        Then('only the non-passing try under ai-trace writes it, and under trace off it is the only file')((
          s,
          expect,
        ) =>
          expect(s.state).toEqual([
            ['blocked', ['ai-trace']],
            ['passed', ['screen-text', 'screenshot', 'trace-page']],
            ['blocked', ['screen-text', 'screenshot', 'trace-page']],
          ])
        ),
      ),
    )

    scenario(
      'A failed try that made no model call still writes an empty ai-trace',
      Gherkin.Do.pipe(
        When('a try under ai-trace opens a page the app does not serve without asking the model')(
          'state',
          () => noModelCall,
        ),
        Then('the try is blocked and its ai-trace lists no call')((s, expect) =>
          expect(s.state).toEqual(['blocked', 0])
        ),
      ),
    )

    scenario(
      'An evidence store that refuses the ai-trace is recorded on the attempt',
      Gherkin.Do.pipe(
        When('a blocked try under ai-trace and trace off ends against a refusing store')('state', () => refusedStore),
        Then('the attempt lists ARTIFACT_WRITE_FAILED and no artifact')((s, expect) =>
          expect(s.state).toEqual(['blocked', ['APP_UNREACHABLE', 'ARTIFACT_WRITE_FAILED'], []])
        ),
      ),
    )

    scenario(
      'A call that fails, dies or is interrupted is recorded with that outcome',
      Gherkin.Do.pipe(
        When('one try meets a provider failure, one a gateway defect, and one ends while its call still waits')(
          'state',
          () => everyOutcome,
        ),
        Then('each ai-trace names the outcome its call met')((s, expect) =>
          expect(s.state).toEqual({
            failed: [{ _tag: 'Failed', code: 'MODEL_PROVIDER_FAILED', message: 'the provider answered 503' }],
            diedNamesDefect: true,
            interrupted: [{ _tag: 'Interrupted' }],
          })
        ),
      ),
    )

    scenario(
      'A screenshot sent to the model is recorded as its byte count, never its data',
      Gherkin.Do.pipe(
        When('the model asks for a screenshot and then finishes, and the try ends blocked')('state', () => imageElided),
        Then("the second call's image part names its media type and byte count and the file holds no image data")((
          s,
          expect,
        ) => expect(s.state).toEqual({ sentOneImage: 1, traced: true, dataAbsent: true })),
      ),
    )
  })
