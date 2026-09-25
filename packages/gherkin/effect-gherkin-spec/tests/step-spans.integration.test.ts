import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { And, But, Gherkin, Given, pairwiseFor, StepError, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { step } from '@systemfsoftware/vitest/integration'
import { Cause, Context, Effect, Exit, Fiber, Layer, Match, Option, Result, Tracer } from 'effect'
import { AccessDenied, TestDomainError } from './__fixtures__/TestDomainError.schema.js'

const Feature = makeFeature({ it })

class Widget extends Context.Service<Widget, { readonly value: string }>()(
  '@systemfsoftware/effect-gherkin-spec/tests/step-spans.integration.test/Widget',
) {}

const PairwiseAB = pairwiseFor(
  {
    a: { name: 'A', layer: Layer.succeed(Widget, { value: 'side-a' }) },
    b: { name: 'B', layer: Layer.succeed(Widget, { value: 'side-b' }) },
  },
  Widget,
)

const STEP_SPAN = 'gherkin.step'
const SITE_SHAPE = /^\/.+\.test\.ts:\d+:\d+$/u
const MARKER_FRAME = /^\s+at (?:.*\()?(.+?):(\d+):\d+\)?$/mu
const STACK_FRAME = /^\s+at (?:.*\()?(.+?):(\d+)(?::\d+)?\)?$/mu

const frameOf = (stack: string | undefined, pattern: RegExp): string | null => {
  const match = pattern.exec(stack ?? '')
  if (match === null || match[1] === undefined || match[2] === undefined) return null
  return `${match[1]}:${match[2]}`
}

const siteLine = (site: string): string => site.replace(/:\d+$/u, '')

const stackLine = (stack: string | undefined): string => frameOf(stack, STACK_FRAME) ?? ''

interface SpecLines {
  readonly lines: Array<string>
}

/** Records the line its probe was built on — the step's own line — and hands the step text back. */
const marked = <Text>(marks: SpecLines, probe: Error, text: Text): Text => {
  marks.lines.push(frameOf(probe.stack, MARKER_FRAME) ?? '')
  return text
}

const isText = (value: unknown): value is string => typeof value === 'string'

interface SpanLog {
  readonly spans: Array<Tracer.NativeSpan>
  readonly tracer: Tracer.Tracer
}

interface StepFact {
  readonly keyword: string
  readonly text: string
  readonly site: string
  readonly line: string
  readonly status: string
  readonly failed: boolean
}

const recordingTracer = (): SpanLog => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return { spans, tracer }
}

const attributeText = (span: Tracer.NativeSpan, name: string): string => {
  const value = span.attributes.get(name)
  return isText(value) ? value : ''
}

const statusTag = (span: Tracer.NativeSpan): string =>
  Match.value(span.status).pipe(
    Match.tag('Ended', () => 'Ended'),
    Match.orElse(() => 'Started'),
  )

const failedSpan = (span: Tracer.NativeSpan): boolean =>
  Match.value(span.status).pipe(
    Match.tag('Ended', (status) => Exit.isFailure(status.exit)),
    Match.orElse(() => false),
  )

const stepSpansOf = (log: SpanLog, text: string): ReadonlyArray<Tracer.NativeSpan> =>
  log.spans.filter((span) => span.name === STEP_SPAN && attributeText(span, 'gherkin.text') === text)

const factOf = (span: Tracer.NativeSpan): StepFact => {
  const site = attributeText(span, 'code.site')
  return {
    keyword: attributeText(span, 'gherkin.keyword'),
    text: attributeText(span, 'gherkin.text'),
    site,
    line: siteLine(site),
    status: statusTag(span),
    failed: failedSpan(span),
  }
}

const spanFact = (log: SpanLog, text: string): StepFact | null => {
  const span = stepSpansOf(log, text)[0]
  if (span === undefined) return null
  return factOf(span)
}

const failureOf = <A, E>(result: Result.Result<A, E>): E | null => (Result.isFailure(result) ? result.failure : null)

const outcomeOf = <A, E>(result: Result.Result<A, E>): string => (Result.isFailure(result) ? 'Failure' : 'Success')

const messageOf = (error: StepError | null): string => (error === null ? '' : error.message)

const messageStartsWith = (error: StepError | null, prefix: string): boolean =>
  error !== null && error.message.startsWith(prefix)

const bindingCountText = (scope: object): string => `the scope has ${Object.keys(scope).length} binding`

/** Runs a pipeline under a fresh recorder and hands back that run's spans and its result. */
const traced = <A, E, R>(
  pipeline: Effect.Effect<A, E, R>,
): Effect.Effect<{ readonly log: SpanLog; readonly result: Result.Result<A, E> }, never, R> => {
  const log = recordingTracer()
  return pipeline.pipe(Effect.withTracer(log.tracer), Effect.result, Effect.map((result) => ({ log, result })))
}

const marks: SpecLines = { lines: [] }
const givenWhenThen = Gherkin.Do.pipe(
  Given(marked(marks, new Error(), 'the first step binds a number'))('x', () => Effect.succeed(1)),
  When(marked(marks, new Error(), 'the second step reads the binding'))('y', (s) => Effect.succeed(s.x + 1)),
  Then(marked(marks, new Error(), 'the third step asserts on the binding'))((s, expect) => expect(s.y).toBe(2)),
)

const assertionMarks: SpecLines = { lines: [] }
const andPipeline = Gherkin.Do.pipe(
  Given(marked(assertionMarks, new Error(), 'a first state the And step asserts'))('a', () => Effect.succeed(1)),
  And(marked(assertionMarks, new Error(), 'an and step asserts the first state'))((s, expect) => expect(s.a).toBe(1)),
)
const butPipeline = Gherkin.Do.pipe(
  Given(marked(assertionMarks, new Error(), 'a second state the But step asserts'))('b', () => Effect.succeed(2)),
  But(marked(assertionMarks, new Error(), 'a but step asserts the second state'))((s, expect) => expect(s.b).toBe(2)),
)

const failingMarks: SpecLines = { lines: [] }
const failingGiven = Gherkin.Do.pipe(
  Given(marked(failingMarks, new Error(), 'the given step that fails'))('x', () => Effect.fail('first_defect')),
)
const failingThen = Gherkin.Do.pipe(
  Then(marked(failingMarks, new Error(), 'the then step that fails'))(() => {
    throw new Error('second_defect')
  }),
)

const computedMarks: SpecLines = { lines: [] }
const computedFailure = Gherkin.Do.pipe(
  Given('a bound count of seven')('count', () => Effect.succeed(7)),
  Then(marked(computedMarks, new Error(), bindingCountText))((s, expect) => expect(s.count).toBe(8)),
)

const pairwiseMarks: SpecLines = { lines: [] }
const pairwiseRun = Gherkin.Do.pipe(
  PairwiseAB(marked(pairwiseMarks, new Error(), 'the workload reads the widget'))(
    'dual',
    () => (w) => Effect.succeed(w.value),
  ),
  Then('the workload read each side')(({ dual }, expect) =>
    expect({ a: dual.a, b: dual.b }).toEqual({ a: 'side-a', b: 'side-b' })
  ),
)

type CauseKind = 'an error with a message' | 'a tagged error with no message' | 'a plain value'

const causes: Record<CauseKind, Effect.Effect<never, TestDomainError | AccessDenied | string>> = {
  'an error with a message': Effect.fail(new TestDomainError({ message: 'boom' })),
  'a tagged error with no message': Effect.fail(new AccessDenied({ user: 'bob' })),
  'a plain value': Effect.fail('unauthorized_access'),
}

const OUTAGE = 'Service outage: the gateway stopped answering'

const failingChild = Effect.fail(OUTAGE).pipe(Effect.forkChild, Effect.flatMap(Fiber.join))

const capturedOutage = Gherkin.Do.pipe(
  Given('a failing child fiber inside a step')('outcome', () => Effect.exit(failingChild)),
)

/** The span name the runtime annotated onto a failure, or '' when the cause carries no stack frame. */
const stepFrameName = (cause: Cause.Cause<string>): string =>
  Option.match(Context.getOption(Cause.annotations(cause), Cause.StackTrace), {
    onNone: () => '',
    onSome: (frame) => frame.name,
  })

Feature('A gherkin step records its span and the step failure derives its message')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A run of Given, When and Then steps records one gherkin.step span per step',
      Gherkin.Do.pipe(
        Given('a traced run of a three-step pipeline')('spanLog', () => traced(givenWhenThen)),
        Then('each span carries its keyword, its resolved text and the spec line that wrote it')((s, expect) => {
          const facts = [
            spanFact(s.spanLog.log, 'the first step binds a number'),
            spanFact(s.spanLog.log, 'the second step reads the binding'),
            spanFact(s.spanLog.log, 'the third step asserts on the binding'),
          ]
          return step(
            expect({
              keywordText: facts.map((fact) => ({ keyword: fact?.keyword, text: fact?.text })),
              line: facts.map((fact) => fact?.line),
              status: facts.map((fact) => ({ status: fact?.status, failed: fact?.failed })),
              sites: facts.map((fact) => SITE_SHAPE.test(fact?.site ?? '')),
            }).toEqual({
              keywordText: [
                { keyword: 'given', text: 'the first step binds a number' },
                { keyword: 'when', text: 'the second step reads the binding' },
                { keyword: 'then', text: 'the third step asserts on the binding' },
              ],
              line: marks.lines,
              status: [
                { status: 'Ended', failed: false },
                { status: 'Ended', failed: false },
                { status: 'Ended', failed: false },
              ],
              sites: [true, true, true],
            }),
          )
        }),
      ),
    )

    scenario(
      'A run of And and But assertion steps records one gherkin.step span per step',
      Gherkin.Do.pipe(
        Given('a traced run whose assertion steps are spelled And and But')('spanLog', () => {
          const log = recordingTracer()
          const both = Effect.all([andPipeline, butPipeline], { concurrency: 1 })
          return both.pipe(Effect.withTracer(log.tracer), Effect.result, Effect.map(() => log))
        }),
        Then('each assertion step span carries its own keyword and its own spec line')((s, expect) => {
          const facts = [
            spanFact(s.spanLog, 'a first state the And step asserts'),
            spanFact(s.spanLog, 'an and step asserts the first state'),
            spanFact(s.spanLog, 'a second state the But step asserts'),
            spanFact(s.spanLog, 'a but step asserts the second state'),
          ]
          return step(
            expect({
              keyword: facts.map((fact) => fact?.keyword),
              line: facts.map((fact) => fact?.line),
              failed: facts.map((fact) => fact?.failed),
            }).toEqual({
              keyword: ['given', 'and', 'given', 'but'],
              line: assertionMarks.lines,
              failed: [false, false, false, false],
            }),
          )
        }),
      ),
    )

    scenarioOutline(
      'A failed Given names the step and <cause> in its message',
      [
        { cause: 'an error with a message', message: 'Given "the account opens" failed: TestDomainError: boom' },
        {
          cause: 'a tagged error with no message',
          message: 'Given "the account opens" failed: AccessDenied {"user":"bob"}',
        },
        { cause: 'a plain value', message: 'Given "the account opens" failed: "unauthorized_access"' },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given(`a pipeline whose step fails with ${row.cause}`)('result', () =>
            Gherkin.Do.pipe(Given('the account opens')('account', () => causes[row.cause]), Effect.result)),
          Then('the step error message reads as the failing step and its cause')((s, expect) => {
            const failure = failureOf(s.result)
            return step(expect(messageOf(failure)).toBe(row.message))
          }),
        ),
    )

    scenario(
      'A step error derives its message from its fields without widening its encoded shape',
      Gherkin.Do.pipe(
        Given('a step error built from a keyword, a text and a null cause')(
          'err',
          () => Effect.succeed(StepError.make({ keyword: 'when', text: 'action', cause: null })),
        ),
        Then('the message is derived while the encoded shape keeps its three fields')((s, expect) =>
          step(
            expect({
              message: s.err.message,
              derived: s.err.message !== '',
              ownMessageProperty: Object.getOwnPropertyDescriptor(s.err, 'message') === undefined,
              ownKeys: Object.keys(s.err).sort(),
            }).toEqual({
              message: 'When "action" failed',
              derived: true,
              ownMessageProperty: true,
              ownKeys: ['_tag', 'cause', 'keyword', 'text'],
            }),
          )
        ),
      ),
    )

    scenario(
      'A step whose text is computed from the scope carries the resolved text in its span and its failure',
      Gherkin.Do.pipe(
        Given('a traced run whose failing step text is computed from the scope')(
          'spanLog',
          () => traced(computedFailure),
        ),
        Then('the span and the message both read the resolved text and the message stays one line')((s, expect) => {
          const fact = spanFact(s.spanLog.log, 'the scope has 1 binding')
          const failure = failureOf(s.spanLog.result)
          return step(
            expect({
              outcome: outcomeOf(s.spanLog.result),
              text: fact?.text,
              line: fact?.line,
              failed: fact?.failed,
              headline: messageStartsWith(failure, 'Then "the scope has 1 binding" failed: '),
              messageLines: messageOf(failure).split('\n').length,
            }).toEqual({
              outcome: 'Failure',
              text: 'the scope has 1 binding',
              line: computedMarks.lines[0],
              failed: true,
              headline: true,
              messageLines: 1,
            }),
          )
        }),
      ),
    )

    scenario(
      'Two failing steps written on different lines point their span and their stack at their own line',
      Gherkin.Do.pipe(
        Given('a traced run with a failing Given and a failing Then')('spanLog', () => {
          const log = recordingTracer()
          const both = Effect.all([Effect.result(failingGiven), Effect.result(failingThen)], { concurrency: 1 })
          return both.pipe(Effect.withTracer(log.tracer), Effect.map(([given, thenStep]) => ({ log, given, thenStep })))
        }),
        Then('each failure carries its own spec line in its span and in its stack')((s, expect) =>
          step(
            expect({
              givenSpan: spanFact(s.spanLog.log, 'the given step that fails'),
              thenSpan: spanFact(s.spanLog.log, 'the then step that fails'),
              givenStack: stackLine(failureOf(s.spanLog.given)?.stack),
              thenStack: stackLine(failureOf(s.spanLog.thenStep)?.stack),
            }).toMatchObject({
              givenSpan: {
                keyword: 'given',
                text: 'the given step that fails',
                line: failingMarks.lines[0],
                status: 'Ended',
                failed: true,
              },
              thenSpan: {
                keyword: 'then',
                text: 'the then step that fails',
                line: failingMarks.lines[1],
                status: 'Ended',
                failed: true,
              },
              givenStack: failingMarks.lines[0],
              thenStack: failingMarks.lines[1],
            }),
          )
        ),
      ),
    )

    scenario(
      'A pairwise step records its span with the pairwise keyword and the line that wrote it',
      Gherkin.Do.pipe(
        Given('a traced pairwise run against two layers')('spanLog', () => traced(pairwiseRun)),
        Then('both side spans carry the pairwise keyword, the side label and the spec line')((s, expect) => {
          const facts = [
            spanFact(s.spanLog.log, 'the workload reads the widget [A]'),
            spanFact(s.spanLog.log, 'the workload reads the widget [B]'),
          ]
          return step(
            expect({
              keywordText: facts.map((fact) => ({ keyword: fact?.keyword, text: fact?.text })),
              line: facts.map((fact) => fact?.line),
              failed: facts.map((fact) => fact?.failed),
            }).toEqual({
              keywordText: [
                { keyword: 'pairwise', text: 'the workload reads the widget [A]' },
                { keyword: 'pairwise', text: 'the workload reads the widget [B]' },
              ],
              line: [pairwiseMarks.lines[0], pairwiseMarks.lines[0]],
              failed: [false, false],
            }),
          )
        }),
      ),
    )

    scenario(
      'A failure raised inside a step carries no stack annotation from the step span',
      Gherkin.Do.pipe(
        Given('a traced run that holds the exit of a failing child fiber')('spanLog', () => traced(capturedOutage)),
        Then('the captured cause names no gherkin.step stack frame')((s, expect) => {
          const captured = Result.isSuccess(s.spanLog.result) ? s.spanLog.result.success.outcome : null
          const cause: Cause.Cause<string> = captured !== null && Exit.isFailure(captured)
            ? captured.cause
            : Cause.fail('no capture')
          return Effect.all([
            step(expect(outcomeOf(s.spanLog.result)).toEqual('Success')),
            step(expect(Cause.squash(cause)).toEqual(OUTAGE)),
            step(expect(stepFrameName(cause)).toEqual('')),
            step(
              expect(Cause.pretty(cause)).toSatisfy(
                (text) => !text.includes(STEP_SPAN),
                `the rendered cause names no ${STEP_SPAN} frame`,
              ),
            ),
          ])
        }),
      ),
    )
  })
