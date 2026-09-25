import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import {
  And,
  But,
  Gherkin,
  Given,
  StepError,
  Then,
  type VitestTaskContext,
  VitestTaskRef,
  When,
} from '@systemfsoftware/effect-gherkin-spec'
import { step } from '@systemfsoftware/vitest/integration'
import { Chunk, Effect, Layer, Result } from 'effect'
import { AccessDenied, TestDomainError } from './__fixtures__/test-domain-error.fixture.js'

const Feature = makeFeature({ it })

const envelopeOf = <A>(
  result: Result.Result<A, StepError>,
): { readonly tag: string; readonly keyword: string | null; readonly text: string | null } =>
  Result.isFailure(result)
    ? { tag: result.failure._tag, keyword: result.failure.keyword, text: result.failure.text }
    : { tag: result._tag, keyword: null, text: null }

const normalizeAnnotation = (entry: { readonly message: string; readonly type?: string | undefined }) => ({
  message: entry.message.replace(/\(\d+ms\)/u, '(Xms)'),
  type: entry.type,
})

const failureOf = <A>(result: Result.Result<A, StepError>): StepError | null =>
  Result.isFailure(result) ? result.failure : null

const FRAME = /^\s+at (?:.*\()?(.+):\d+\)?$/mu

const writtenAt = (stack: string | undefined): string | null => FRAME.exec(stack ?? '')?.[1] ?? null

type CauseKind = 'an error with a message' | 'a tagged error with no message' | 'a plain value'

const causes: Record<CauseKind, Effect.Effect<never, TestDomainError | AccessDenied | string>> = {
  'an error with a message': Effect.fail(new TestDomainError({ message: 'boom' })),
  'a tagged error with no message': Effect.fail(new AccessDenied({ user: 'bob' })),
  'a plain value': Effect.fail('unauthorized_access'),
}

Feature('Gherkin step combinators')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A step assertion verifies Effect values using value equality',
      Gherkin.Do.pipe(
        Given('a list of numbers in a Chunk')('items', () => Effect.succeed(Chunk.make(1, 2, 3))),
        Then('the items match an identical Chunk by value equality')((s, expect) =>
          expect(s.items).toEqual(Chunk.make(1, 2, 3))
        ),
      ),
    )

    scenario(
      'A domain error from a step is surfaced as a step failure',
      Gherkin.Do.pipe(
        Given('a pipeline whose only step fails with a domain error')('result', () =>
          Effect.result(
            Gherkin.Do.pipe(
              Given('failing step')('x', () => Effect.fail(new TestDomainError({ message: 'domain oops' }))),
            ),
          )),
        Then('the failure is a step error carrying the failing step')((s, expect) =>
          expect(envelopeOf(s.result)).toEqual({ tag: 'StepError', keyword: 'given', text: 'failing step' })
        ),
      ),
    )

    scenario(
      'A failing Then assertion surfaces as a StepError',
      Gherkin.Do.pipe(
        Given('a pipeline whose check fails')('result', () =>
          Effect.result(
            Gherkin.Do.pipe(
              Given('setup')('x', () => Effect.succeed(1)),
              Then('assertion')((s, expect) => expect(s.x).toBe(999)),
            ),
          )),
        Then('the failing check is wrapped as a step error carrying the failing step')((s, expect) =>
          step(expect(envelopeOf(s.result)).toEqual({ tag: 'StepError', keyword: 'then', text: 'assertion' }))
        ),
      ),
    )

    scenario(
      'A failing Then step surfaces as a StepError',
      Gherkin.Do.pipe(
        Given('a pipeline whose Then throws instead of checking')('result', () =>
          Effect.result(
            Gherkin.Do.pipe(
              Given('setup')('x', () => Effect.succeed(1)),
              Then('fail')(() => {
                throw new Error('then-err')
              }),
            ),
          )),
        Then('the thrown failure is wrapped as a step error carrying the failing step')((s, expect) =>
          expect(envelopeOf(s.result)).toEqual({ tag: 'StepError', keyword: 'then', text: 'fail' })
        ),
      ),
    )

    scenario(
      'A constructed step error carries its keyword and text',
      Gherkin.Do.pipe(
        Given('a step error built from a keyword and text')(
          'err',
          () => Effect.succeed(StepError.make({ keyword: 'when', text: 'action', cause: null })),
        ),
        Then('it reports that keyword and text')((s, expect) =>
          expect({
            tag: s.err._tag,
            keyword: s.err.keyword,
            text: s.err.text,
            cause: s.err.cause,
            message: s.err.message,
          }).toEqual({
            tag: 'StepError',
            keyword: 'when',
            text: 'action',
            cause: null,
            message: 'When "action" failed',
          })
        ),
      ),
    )

    scenario(
      'A step error preserves its original cause',
      Gherkin.Do.pipe(
        Given('a step error built around a recorded failure')('built', () => {
          const original = new Error('deep failure')
          return Effect.succeed({ err: StepError.make({ keyword: 'given', text: 'step', cause: original }), original })
        }),
        Then('it still carries the original failure')((s, expect) => expect(s.built.err.cause).toBe(s.built.original)),
      ),
    )

    scenarioOutline(
      'A failed step names the step and <cause> in its message',
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
            Effect.result(Gherkin.Do.pipe(Given('the account opens')('account', () => causes[row.cause])))),
          Then('the step error message reads as the failing step and its cause')((s, expect) =>
            expect(failureOf(s.result)?.message).toBe(row.message)
          ),
        ),
    )

    scenario(
      'A failed step points its stack at the spec line that wrote it',
      Gherkin.Do.pipe(
        Given('a failing Given and a failing Then, each written beside a marker')('written', () => {
          const [givenStep, givenLine] = [Gherkin.Do.pipe(Given('fail')('x', () => Effect.fail('err'))), new Error()]
          const throwErr = (): never => {
            throw new Error('err')
          }
          const [thenStep, thenLine] = [Gherkin.Do.pipe(Then('fail')(throwErr)), new Error()]
          return Effect.succeed({ givenStep, givenLine, thenStep, thenLine })
        }),
        When('both pipelines run')(
          'results',
          (s) =>
            Effect.all({ givenStep: Effect.result(s.written.givenStep), thenStep: Effect.result(s.written.thenStep) }),
        ),
        Then('each stack starts at the line that wrote its step')((s, expect) =>
          expect({
            givenStep: writtenAt(failureOf(s.results.givenStep)?.stack),
            thenStep: writtenAt(failureOf(s.results.thenStep)?.stack),
          }).toEqual({ givenStep: writtenAt(s.written.givenLine.stack), thenStep: writtenAt(s.written.thenLine.stack) })
        ),
      ),
    )

    scenarioOutline(
      'A failed step of keyword <keyword> carries the keyword in its error envelope',
      [
        { keyword: 'given' },
        { keyword: 'when' },
        { keyword: 'then' },
        { keyword: 'and' },
        { keyword: 'but' },
      ] as const,
      (row) => {
        const resultOf = <A, E, R>(pipeline: Effect.Effect<A, E, R>): Effect.Effect<Result.Result<void, E>, never, R> =>
          Effect.result(pipeline.pipe(Effect.asVoid))
        const pipelineForKeyword = () => {
          if (row.keyword === 'given') {
            return resultOf(Gherkin.Do.pipe(Given('fail')('x', () => Effect.fail('err'))))
          }
          if (row.keyword === 'when') {
            return resultOf(
              Gherkin.Do.pipe(
                Given('ok')('x', () => Effect.succeed(1)),
                When('fail')('y', () => Effect.fail('err')),
              ),
            )
          }
          if (row.keyword === 'then') {
            return resultOf(
              Gherkin.Do.pipe(
                Given('ok')('x', () => Effect.succeed(1)),
                Then('fail')(() => {
                  throw new Error('err')
                }),
              ),
            )
          }
          if (row.keyword === 'and') {
            return resultOf(
              Gherkin.Do.pipe(
                Given('ok')('x', () => Effect.succeed(1)),
                And('fail')(() => {
                  throw new Error('err')
                }),
              ),
            )
          }
          return resultOf(
            Gherkin.Do.pipe(
              Given('ok')('x', () => Effect.succeed(1)),
              But('fail')(() => {
                throw new Error('err')
              }),
            ),
          )
        }
        return Gherkin.Do.pipe(
          Given('an executed step configured to fail')('result', pipelineForKeyword),
          Then('the error carries the matching keyword name')((s, expect) =>
            expect(envelopeOf(s.result)).toEqual({ tag: 'StepError', keyword: row.keyword, text: 'fail' })
          ),
        )
      },
    )

    scenario(
      'A full pipeline accumulates bindings across Given, When and And',
      Gherkin.Do.pipe(
        Given('user exists')('user', () => Effect.succeed({ id: 1 })),
        When('request sent')('response', (s) => Effect.succeed({ status: 200, userId: s.user.id })),
        And('the response carries the status and the user id')((s, expect) =>
          expect({ status: s.response.status, userId: s.response.userId, user: s.user.id }).toEqual({
            status: 200,
            userId: 1,
            user: 1,
          })
        ),
      ),
    )

    scenario(
      'Chained When steps each read bindings from prior steps',
      Gherkin.Do.pipe(
        Given('base')('a', () => Effect.succeed(1)),
        When('double')('b', (s) => Effect.succeed(s.a * 2)),
        When('add ten')('c', (s) => Effect.succeed(s.b + 10)),
        Then('all values correct')((s, expect) => expect({ a: s.a, b: s.b, c: s.c }).toEqual({ a: 1, b: 2, c: 12 })),
      ),
    )

    scenario(
      'A pre-seeded scope is available to subsequent steps',
      Gherkin.startWith({ userId: 42 }).pipe(
        When('fetch user')('profile', (s) => Effect.succeed({ name: 'Alice', id: s.userId })),
        Then('the fetched profile belongs to the pre-seeded user')((s, expect) =>
          expect({ userId: s.userId, profile: s.profile }).toEqual({ userId: 42, profile: { name: 'Alice', id: 42 } })
        ),
      ),
    )

    scenario(
      'Pre-seeded bindings remain visible inside the scenario',
      Gherkin.startWith({ x: 'typed', y: 123 }).pipe(
        Then('both seeded values are visible')((s, expect) =>
          expect({ x: s.x, y: s.y }).toEqual({ x: 'typed', y: 123 })
        ),
      ),
    )

    scenario(
      'A Then step returning an Effect leaves the scope intact',
      Gherkin.Do.pipe(
        Given('setup')('x', () => Effect.succeed(1)),
        Then('the check runs from an Effect and leaves the scope at the one binding')((s, expect) =>
          Effect.map(
            Effect.succeed(s),
            (scope) => expect({ keys: Object.keys(scope), x: scope.x }).toEqual({ keys: ['x'], x: 1 }),
          )
        ),
      ),
    )

    scenario(
      'An And step returning an Effect leaves the scope intact',
      Gherkin.Do.pipe(
        Given('setup')('x', () => Effect.succeed(42)),
        When('the binding is observed')('observed', (s) => Effect.succeed(s.x)),
        And('the observed binding still reads from an Effect-returning body')((s, expect) =>
          Effect.map(Effect.succeed(s.observed), (x) => expect(x).toBe(42))
        ),
      ),
    )

    scenario(
      'A failing Effect-returning Then step surfaces as a step failure',
      Gherkin.Do.pipe(
        Given('a pipeline whose Then effect fails with a domain error')('result', () =>
          Effect.result(
            Gherkin.Do.pipe(
              Given('setup')('x', () => Effect.succeed(1)),
              Then('Effect that fails')(() => Effect.fail(new TestDomainError({ message: 'effect-fail' }))),
            ),
          )),
        Then('the failing effect is wrapped as a step error carrying the failing step')((s, expect) =>
          expect(envelopeOf(s.result)).toEqual({ tag: 'StepError', keyword: 'then', text: 'Effect that fails' })
        ),
      ),
    )

    scenario(
      'An assertion failure inside an Effect-returning Then step fails the step',
      Gherkin.Do.pipe(
        Given('a pipeline whose Effect-returning check fails')('result', () =>
          Effect.result(
            Gherkin.Do.pipe(
              Given('setup')('x', () => Effect.succeed(1)),
              Then('Effect assertion')((s, expect) => Effect.map(Effect.succeed(s.x), (x) => expect(x).toBe(999))),
            ),
          )),
        Then('the assertion failure is wrapped as a step error carrying the failing step')((s, expect) =>
          step(expect(envelopeOf(s.result)).toEqual({ tag: 'StepError', keyword: 'then', text: 'Effect assertion' }))
        ),
      ),
    )

    scenario(
      'An empty pipeline exposes an empty scope',
      Gherkin.Do.pipe(
        Then('nothing has been bound yet')((s, expect) => expect(Object.keys(s)).toEqual([])),
      ),
    )

    scenario(
      'A step with empty text still binds its value',
      Gherkin.Do.pipe(
        Given('')('x', () => Effect.succeed('empty-text')),
        Then('the binding is present')((s, expect) => expect({ x: s.x }).toEqual({ x: 'empty-text' })),
      ),
    )

    scenario(
      'Reusing a binding name overrides the prior value',
      Gherkin.Do.pipe(
        Given('first')('x', () => Effect.succeed(1)),
        Given('second')('x', (s) => Effect.succeed(s.x + 1)),
        Then('the second binding replaces the first')((s, expect) => expect({ x: s.x }).toEqual({ x: 2 })),
      ),
    )

    scenario(
      'Step execution writes progress and timing annotations to the reporting context',
      Gherkin.Do.pipe(
        Given('a reporting context that records its annotations')('notebook', () => {
          const annotations: Array<{ message: string; type?: string | undefined }> = []
          const reporterCtx: VitestTaskContext = {
            annotate: (message: string, type?: string) => {
              annotations.push({ message, type })
            },
          }
          return Effect.succeed({ annotations, reporterCtx })
        }),
        When('a three-step pipeline runs against that context')((s) =>
          Gherkin.Do.pipe(
            Given('an active user account')('userId', () => Effect.succeed('usr_123')),
            When('the user updates their notification preferences')((scope) => Effect.succeed(scope.userId)),
            Then('the preferences are stored successfully')((scope, expect) => expect(scope.userId).toBe('usr_123')),
            Effect.provideService(VitestTaskRef, s.notebook.reporterCtx),
          )
        ),
        Then('the context recorded one passing notice per step in order')((s, expect) =>
          step(
            expect(s.notebook.annotations.map(normalizeAnnotation)).toEqual([
              { message: '[GIVEN] an active user account - passed (Xms)', type: 'notice' },
              { message: '[WHEN] the user updates their notification preferences - passed (Xms)', type: 'notice' },
              { message: '[THEN] the preferences are stored successfully - passed (Xms)', type: 'notice' },
            ]),
          )
        ),
      ),
    )

    scenario(
      'A failed step emits a failure diagnostic to the reporting context',
      Gherkin.Do.pipe(
        Given('a reporting context that records its annotations')('notebook', () => {
          const annotations: Array<{ message: string; type?: string | undefined }> = []
          const reporterCtx: VitestTaskContext = {
            annotate: (message: string, type?: string) => {
              annotations.push({ message, type })
            },
          }
          return Effect.succeed({ annotations, reporterCtx })
        }),
        When('a pipeline whose Then check fails runs against that context')('result', (s) =>
          Effect.result(
            Gherkin.Do.pipe(
              Given('an initial order submission')('orderId', () => Effect.succeed('ord_999')),
              Then('the inventory reservation confirms')((scope, expect) => expect(scope.orderId).toBe('ord_000')),
              Effect.provideService(VitestTaskRef, s.notebook.reporterCtx),
            ),
          )),
        Then('the run failed and the context recorded the given pass and the then failure')((s, expect) =>
          step(
            expect({ tag: s.result._tag, annotations: s.notebook.annotations.map(normalizeAnnotation) }).toEqual({
              tag: 'Failure',
              annotations: [
                { message: '[GIVEN] an initial order submission - passed (Xms)', type: 'notice' },
                { message: '[THEN] the inventory reservation confirms - failed (Xms)', type: 'error' },
              ],
            }),
          )
        ),
      ),
    )
  })
