import { assert, SecretLedger } from '@systemfsoftware/effect-e2e/agent'
import { MemoryCacheStore } from '@systemfsoftware/effect-e2e/cache'
import { Engine } from '@systemfsoftware/effect-e2e/engine'
import type { ModelAnswer } from '@systemfsoftware/effect-e2e/model'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import { TestClock } from 'effect/testing'

import { babble, GREET_SITE, ORIGIN, RENAMED_SITE, silentGateway } from './__fixtures__/agent-sites.fixture.js'
import {
  BANNER_HIDDEN_SITE,
  BANNER_SHOWN_SITE,
  checkShapeOf,
  failureShapeOf,
  failureTagOf,
  judgmentContextOf,
  judgmentRecorder,
  lookupOf,
  namesOn,
  type Plan,
  proposalOf,
  proposeCause,
  ran,
  recordingKindOf,
  requestText,
  resolveCheck,
  scriptedGateway,
  SECRET_RECEIPT_SITE,
  SHOWN_SECRET,
  SHOWN_SECRET_LEDGER,
  stagedOf,
  withRequests,
  writtenEntryOf,
} from './__fixtures__/judgment-sites.fixture.js'

const Feature = makeFeature({ it })

Feature('Asserting statements against the app')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A true statement passes',
      Gherkin.Do.pipe(
        Given('the model resolves the greeting check on the greeted screen')('plan', () =>
          Effect.succeed(
            {
              engine: Engine.layerTest(GREET_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the greeting says hello',
            } satisfies Omit<Plan, 'gateway'>,
          )),
        When('the statement is asserted')('state', (s) =>
          withRequests({
            plan: s.plan,
            answers: [
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value: 'Hello' }],
              }),
            ],
          })),
        Then('the step passes, resolves once and stages a Write')((s, expect) =>
          expect({
            outcome: Result.map(
              s.state.outcome,
              (result) => ({ modelCalls: result.modelCalls, lookup: result.lookup }),
            ),
            requests: s.state.requests.length,
            greeted: namesOn(s.state.screen).includes('Hello, Ada'),
            staged: Option.map(stagedOf(s.state), recordingKindOf),
          }).toEqual({
            outcome: Result.succeed({ modelCalls: 1, lookup: { _tag: 'Missed' } }),
            requests: 1,
            greeted: true,
            staged: Option.some('Write'),
          })
        ),
      ),
    )

    scenario(
      'A false statement fails as a product failure',
      Gherkin.Do.pipe(
        Given('the model resolves a greeting check that does not hold')('answers', () =>
          Effect.succeed(
            [
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value: 'Goodbye' }],
              }),
              proposeCause({
                cause: 'product',
                evidence: [{ ref: 'hello' }],
                reason: 'the greeting does not say goodbye',
              }),
            ] satisfies ReadonlyArray<ModelAnswer>,
          )),
        When('the statement is asserted and the failure is classified')('state', (s) =>
          withRequests({
            plan: {
              engine: Engine.layerTest(GREET_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the greeting says goodbye',
            },
            answers: s.answers,
          })),
        Then('the step fails ASSERTION_FAILED with cause product')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            requests: s.state.requests.length,
            outcome: failureShapeOf(s.state.records[0]),
          }).toEqual({
            failure: 'ASSERTION_FAILED',
            requests: 2,
            outcome: ['ASSERTION_FAILED', 'product'],
          })
        ),
      ),
    )

    scenario(
      'A statement about an absent control ends inconclusive',
      Gherkin.Do.pipe(
        Given('the model resolves a check for a control that is not on the screen')('answers', () =>
          Effect.succeed(
            [
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'present', target: { role: 'heading', name: 'Receipt' } }],
              }),
            ] satisfies ReadonlyArray<ModelAnswer>,
          )),
        When('the statement is asserted')('state', (s) =>
          withRequests({
            plan: {
              engine: Engine.layerTest(GREET_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the receipt is shown',
            },
            answers: s.answers,
          })),
        Then('the step ends inconclusive without classifying')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            requests: s.state.requests.length,
            outcome: failureShapeOf(s.state.records[0]),
          }).toEqual({
            failure: 'ASSERTION_INCONCLUSIVE',
            requests: 1,
            outcome: 'Inconclusive',
          })
        ),
      ),
    )

    scenario(
      'A prose answer then an unknown ref fails after two requests',
      Gherkin.Do.pipe(
        Given('the model first answers in prose and then cites a ref that is not on the screen')(
          'answers',
          () =>
            Effect.succeed(
              [
                babble,
                resolveCheck({ combine: 'all', literals: [{ predicate: 'present', target: { ref: 'nowhere' } }] }),
              ] satisfies ReadonlyArray<ModelAnswer>,
            ),
        ),
        When('the statement is asserted')('state', (s) =>
          withRequests({
            plan: {
              engine: Engine.layerTest(GREET_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the greeting says hello',
            },
            answers: s.answers,
          })),
        Then('the step fails MODEL_OUTPUT_INVALID and the record carries the unresolved check')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            requests: s.state.requests.length,
            check: checkShapeOf(s.state.records[0]),
            staged: Option.isSome(stagedOf(s.state)),
          }).toEqual({
            failure: 'MODEL_OUTPUT_INVALID',
            requests: 2,
            check: 'AllOf(0)',
            staged: false,
          })
        ),
      ),
    )

    scenario(
      'A prose answer then a valid call passes after two requests',
      Gherkin.Do.pipe(
        Given('the model first answers in prose and then resolves the greeting check')('answers', () =>
          Effect.succeed(
            [
              babble,
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value: 'Hello' }],
              }),
            ] satisfies ReadonlyArray<ModelAnswer>,
          )),
        When('the statement is asserted')('state', (s) =>
          withRequests({
            plan: {
              engine: Engine.layerTest(GREET_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the greeting says hello',
            },
            answers: s.answers,
          })),
        Then('the step passes after exactly two requests')((s, expect) =>
          expect({
            outcome: Result.map(
              s.state.outcome,
              (result) => ({ modelCalls: result.modelCalls, lookup: result.lookup }),
            ),
            requests: s.state.requests.length,
            staged: Option.map(stagedOf(s.state), recordingKindOf),
          }).toEqual({
            outcome: Result.succeed({ modelCalls: 2, lookup: { _tag: 'Missed' } }),
            requests: 2,
            staged: Option.some('Write'),
          })
        ),
      ),
    )

    scenario(
      'A recorded assertion replays with zero model calls',
      Gherkin.Do.pipe(
        Given('a passing run has staged its judgment recording')('first', () =>
          Effect.gen(function*() {
            const scripted = yield* scriptedGateway([
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value: 'Hello' }],
              }),
            ])
            const result = yield* ran({
              engine: Engine.layerTest(GREET_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the greeting says hello',
              gateway: scripted.layer,
            })
            return { result, staged: stagedOf(result), requests: yield* scripted.requests }
          })),
        When('the same statement runs again against a gateway that dies on any call')(
          'state',
          (s) =>
            Effect.gen(function*() {
              const scripted = yield* scriptedGateway([])
              const result = yield* ran({
                engine: Engine.layerTest(GREET_SITE),
                path: '/greeted',
                kind: 'assert',
                sentence: 'the greeting says hello',
                gateway: scripted.layer,
                seed: s.first.staged,
              })
              return { ...result, requests: yield* scripted.requests }
            }),
        ),
        Then('the step passes with zero requests and keeps the recording')((s, expect) =>
          expect({
            firstRequests: s.first.requests.length,
            outcome: Result.map(
              s.state.outcome,
              (result) => ({ modelCalls: result.modelCalls, lookup: result.lookup }),
            ),
            requests: s.state.requests.length,
            staged: Option.map(stagedOf(s.state), recordingKindOf),
          }).toEqual({
            firstRequests: 1,
            outcome: Result.succeed({ modelCalls: 0, lookup: { _tag: 'Replayed' } }),
            requests: 0,
            staged: Option.some('Keep'),
          })
        ),
      ),
    )

    scenario(
      'A renamed control costs exactly one request',
      Gherkin.Do.pipe(
        Given('a passing run staged a check on the second control')('first', () =>
          Effect.gen(function*() {
            const scripted = yield* scriptedGateway([
              resolveCheck({ combine: 'all', literals: [{ predicate: 'present', target: { ref: 'next' } }] }),
            ])
            const result = yield* ran({
              engine: Engine.layerTest(GREET_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the second control is shown',
              gateway: scripted.layer,
            })
            return { result, staged: stagedOf(result) }
          })),
        When('the recording runs against the app whose control was renamed')('state', (s) =>
          Effect.gen(function*() {
            const scripted = yield* scriptedGateway([
              resolveCheck({ combine: 'all', literals: [{ predicate: 'present', target: { ref: 'next' } }] }),
            ])
            const result = yield* ran({
              engine: Engine.layerTest(RENAMED_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the second control is shown',
              gateway: scripted.layer,
              seed: s.first.staged,
            })
            return { ...result, requests: yield* scripted.requests }
          })),
        Then('one request names the renamed control and the pass overwrites the recording')((s, expect) =>
          expect({
            outcome: Result.map(
              s.state.outcome,
              (result) => ({ modelCalls: result.modelCalls, lookup: result.lookup }),
            ),
            requests: s.state.requests.length,
            seesRenamed: requestText(s.state.requests[0]).includes('\\"Next\\"'),
            staged: Option.map(stagedOf(s.state), recordingKindOf),
          }).toEqual({
            outcome: Result.succeed({ modelCalls: 1, lookup: { _tag: 'Replayed' } }),
            requests: 1,
            seesRenamed: true,
            staged: Option.some('Overwrite'),
          })
        ),
      ),
    )

    scenario(
      'A recorded absence check holds until the banner appears',
      Gherkin.Do.pipe(
        Given('a run recorded that no error banner shows')('first', () =>
          Effect.gen(function*() {
            const scripted = yield* scriptedGateway([
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'present', target: { role: 'alert', name: 'Payment failed' }, negate: true }],
              }),
            ])
            const result = yield* ran({
              engine: Engine.layerTest(BANNER_HIDDEN_SITE),
              path: '/checkout',
              kind: 'assert',
              sentence: 'no error banner is shown',
              gateway: scripted.layer,
            })
            return { staged: stagedOf(result) }
          })),
        When('the recording judges the banner-free checkout again and then the failed checkout')(
          'state',
          (s) =>
            Effect.gen(function*() {
              const absentScripted = yield* scriptedGateway([])
              const absent = yield* ran({
                engine: Engine.layerTest(BANNER_HIDDEN_SITE),
                path: '/checkout',
                kind: 'assert',
                sentence: 'no error banner is shown',
                gateway: absentScripted.layer,
                seed: s.first.staged,
              })
              const absentRan = { ...absent, requests: yield* absentScripted.requests }
              const fiber = yield* Effect.forkChild(
                ran({
                  engine: Engine.layerTest(BANNER_SHOWN_SITE),
                  path: '/checkout',
                  kind: 'assert',
                  sentence: 'no error banner is shown',
                  gateway: silentGateway,
                  seed: s.first.staged,
                  timeout: '1 second',
                }),
              )
              yield* TestClock.adjust('2 seconds')
              const shown = yield* Fiber.join(fiber)
              return { absent: absentRan, shown }
            }),
        ),
        Then('the banner-free replay passes with no model call and the failed replay fails without a proposal')(
          (s, expect) =>
            expect({
              absent: {
                outcome: failureTagOf(s.state.absent.outcome),
                requests: s.state.absent.requests.length,
                check: checkShapeOf(s.state.absent.records[0]),
                lookup: lookupOf(s.state.absent.records[0]),
                staged: Option.map(stagedOf(s.state.absent), recordingKindOf),
              },
              shown: {
                outcome: failureTagOf(s.state.shown.outcome),
                failure: failureShapeOf(s.state.shown.records[0]),
                proposal: proposalOf(s.state.shown.records[0]),
                lookup: lookupOf(s.state.shown.records[0]),
                staged: Option.isSome(stagedOf(s.state.shown)),
              },
            }).toEqual({
              absent: {
                outcome: 'passed',
                requests: 0,
                check: 'Not',
                lookup: { _tag: 'Replayed' },
                staged: Option.some('Keep'),
              },
              shown: {
                outcome: 'ASSERTION_FAILED',
                failure: ['ASSERTION_FAILED', 'product'],
                proposal: null,
                lookup: { _tag: 'Replayed' },
                staged: false,
              },
            }),
        ),
      ),
    )

    scenario(
      'A secret on screen is masked in the request and in every record',
      Gherkin.Do.pipe(
        Given('the model resolves a check built against the masked receipt text')('answers', () =>
          Effect.succeed(
            [
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'text', target: { ref: 'receipt' }, match: 'contains', value: '[secret:pw]' }],
              }),
            ] satisfies ReadonlyArray<ModelAnswer>,
          )),
        When('the statement is asserted while the ledger holds the secret')('state', (s) =>
          withRequests({
            plan: {
              engine: Engine.layerTest(SECRET_RECEIPT_SITE),
              path: '/receipt',
              kind: 'assert',
              sentence: 'the receipt names the confirmation code',
              secrets: SHOWN_SECRET_LEDGER,
            },
            answers: s.answers,
          })),
        Then('the mask reaches the model, the check holds and no artifact keeps the value')((s, expect) =>
          expect({
            outcome: failureTagOf(s.state.outcome),
            maskedInRequest: requestText(s.state.requests[0]).includes('[secret:pw]'),
            rawInRequest: requestText(s.state.requests[0]).includes(SHOWN_SECRET),
            leaks: [
              ...s.state.requests.map(requestText),
              ...s.state.records.map((judgment) => JSON.stringify(judgment)),
              ...Option.toArray(stagedOf(s.state)).flatMap((staged) => Option.toArray(writtenEntryOf(staged))).map(
                (entry) => JSON.stringify(entry),
              ),
            ].filter((text) => text.includes(SHOWN_SECRET)).length,
          }).toEqual({
            outcome: 'passed',
            maskedInRequest: true,
            rawInRequest: false,
            leaks: 0,
          })
        ),
      ),
    )

    scenario(
      'Cancelling a running assertion records nothing',
      Gherkin.Do.pipe(
        Given('the model never answers')('plan', () =>
          Effect.succeed(
            {
              engine: Engine.layerTest(GREET_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the greeting says hello',
            } satisfies Omit<Plan, 'gateway'>,
          )),
        When('the running step is cancelled')('state', (s) =>
          Effect.gen(function*() {
            const books = yield* judgmentRecorder
            const program = Effect.gen(function*() {
              const engine = yield* Engine
              yield* engine.open(`${ORIGIN}/greeted`)
              const context = judgmentContextOf({ record: books.record, mode: 'read-write' })
              return yield* Effect.result(assert({ context, statement: s.plan.sentence }))
            }).pipe(
              Effect.provide(
                Layer.mergeAll(
                  s.plan.engine,
                  silentGateway,
                  MemoryCacheStore.layer({ mode: 'read-write' }),
                  SecretLedger.layer({}),
                ),
              ),
              Effect.orDie,
            )
            const fiber = yield* Effect.forkChild(program)
            yield* Fiber.interrupt(fiber)
            const exit = yield* Fiber.await(fiber)
            return { interrupted: Exit.hasInterrupts(exit), records: yield* books.records }
          })),
        Then('no record is written')((s, expect) =>
          expect({ interrupted: s.state.interrupted, records: s.state.records.length }).toEqual({
            interrupted: true,
            records: 0,
          })
        ),
      ),
    )
  })
