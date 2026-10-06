import { Contract, Operations } from '@systemfsoftware/effect-contract'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Deferred, Effect, Fiber, Match, Option, Stream } from 'effect'
import { person, readOperation } from '../__fixtures__/operations-registry.fixture.js'
import { arm, sinkRuns, storeLayer } from '../__fixtures__/operations-runtime.fixture.js'

const Feature = makeFeature({ it })

const confirmed: Operations.SettlementAnswer = { _tag: 'Completed', output: { outcome: 'confirmed' }, next: [] }
const expired: Operations.SettlementAnswer = { _tag: 'Completed', output: { outcome: 'expired' }, next: [] }

const answerOf = (state: Operations.OperationState): Operations.SettlementAnswer | undefined =>
  Match.value(state).pipe(
    Match.tag('Settled', (settled) => settled.answer),
    Match.orElse(() => undefined),
  )

const lastAnswer = (states: ReadonlyArray<Operations.OperationState>): Operations.SettlementAnswer | undefined =>
  Option.match(
    Option.flatMap(Arr.last(states), (state) => Option.fromUndefinedOr(answerOf(state))),
    { onNone: () => undefined, onSome: (answer) => answer },
  )

Feature('Settling a durable hold exactly once')
  .withScenarioLayer(storeLayer)
  .live('a real workerd runtime runs the operation store Durable Object')
  .body(({ scenario }) => {
    scenario(
      'A confirmed hold settles as confirmed',
      Gherkin.Do.pipe(
        When('a hold is begun and confirmed')(
          'observed',
          () =>
            Effect.gen(function*() {
              const store = yield* Operations.Operations
              const id = yield* store.begin(new Contract.Anonymous({}))
              yield* store.settle(id, confirmed)
              return { answer: answerOf(yield* store.get(id)) }
            }),
        ),
        Then('the settled answer is confirmed')((scope, expect) =>
          expect(scope.observed.answer).toMatchObject({ _tag: 'Completed', output: { outcome: 'confirmed' } })
        ),
      ),
    )

    scenario(
      'An unconfirmed hold expires when the alarm fires',
      Gherkin.Do.pipe(
        When('a short-lived hold is begun, armed and watched unconfirmed')(
          'observed',
          () =>
            Effect.gen(function*() {
              const store = yield* Operations.Operations
              const id = yield* store.begin(new Contract.Anonymous({}))
              yield* arm({ operation: id, ttlMs: 50, answer: expired })
              return { answer: lastAnswer(yield* store.watch(id).pipe(Stream.runCollect)) }
            }),
        ),
        Then('the alarm-settled answer is expired')((scope, expect) =>
          expect(scope.observed.answer).toMatchObject({ _tag: 'Completed', output: { outcome: 'expired' } })
        ),
      ),
    )

    scenario(
      'A confirm after expiry answers AlreadySettled',
      Gherkin.Do.pipe(
        When('a short-lived hold expires and is then confirmed')(
          'observed',
          () =>
            Effect.gen(function*() {
              const store = yield* Operations.Operations
              const id = yield* store.begin(new Contract.Anonymous({}))
              yield* arm({ operation: id, ttlMs: 20, answer: expired })
              yield* store.watch(id).pipe(Stream.runCollect)
              return {
                late: yield* Effect.match(store.settle(id, confirmed), {
                  onFailure: (error) => error,
                  onSuccess: () => undefined,
                }),
              }
            }),
        ),
        Then('the late confirmation is refused as already settled')((scope, expect) =>
          expect(scope.observed.late).toMatchObject({ _tag: 'AlreadySettled' })
        ),
      ),
    )

    scenario(
      'A confirm racing the alarm leaves one settlement and one sink run',
      Gherkin.Do.pipe(
        When('a confirm races the alarm on one hold')(
          'observed',
          () =>
            Effect.gen(function*() {
              const store = yield* Operations.Operations
              const id = yield* store.begin(new Contract.Anonymous({}))
              yield* arm({ operation: id, ttlMs: 5, answer: expired })
              const confirm = yield* Effect.match(store.settle(id, confirmed), {
                onFailure: (error) => error,
                onSuccess: () => undefined,
              })
              const answer = lastAnswer(yield* store.watch(id).pipe(Stream.runCollect))
              const runs = yield* sinkRuns(id)
              return { confirm, answer, runs }
            }),
        ),
        Then('the operation holds one settlement and the sink ran once')((scope, expect) =>
          expect(scope.observed).toMatchObject({ runs: 1, answer: { _tag: 'Completed' } })
        ),
      ),
    )

    scenario(
      'A watch ends on the settled answer before and after settlement',
      Gherkin.Do.pipe(
        When('one watch opens before settlement and another after')(
          'observed',
          () =>
            Effect.gen(function*() {
              const store = yield* Operations.Operations
              const before = yield* store.begin(new Contract.Anonymous({}))
              const registered = yield* Deferred.make<void>()
              const watching = yield* Effect.forkChild(
                Stream.runCollect(
                  store.watch(before).pipe(Stream.tap(() => Deferred.succeed(registered, undefined))),
                ),
              )
              yield* Deferred.await(registered)
              yield* store.settle(before, confirmed)
              const beforeStates = yield* Fiber.join(watching)
              const after = yield* store.begin(new Contract.Anonymous({}))
              yield* store.settle(after, confirmed)
              const afterStates = yield* store.watch(after).pipe(Stream.runCollect)
              return {
                beforeAnswer: lastAnswer(beforeStates),
                afterAnswers: afterStates.length,
                afterAnswer: lastAnswer(afterStates),
              }
            }),
        ),
        Then('both watches end on the settled answer and the late one yields it once')((scope, expect) =>
          expect(scope.observed).toMatchObject({
            beforeAnswer: { _tag: 'Completed', output: { outcome: 'confirmed' } },
            afterAnswers: 1,
            afterAnswer: { _tag: 'Completed', output: { outcome: 'confirmed' } },
          })
        ),
      ),
    )

    scenario(
      'A Person-owned operation answers another principal OperationNotFound',
      Gherkin.Do.pipe(
        When('one principal begins a hold and two principals read it')(
          'observed',
          () =>
            Effect.gen(function*() {
              const store = yield* Operations.Operations
              const alice = yield* person('alice')
              const bob = yield* person('bob')
              const id = yield* store.begin(alice)
              const mine = yield* readOperation({ operation: id, principal: alice })
              const theirs = yield* readOperation({ operation: id, principal: bob })
              return { mine, theirs }
            }),
        ),
        Then('the owner reads the pending operation and the other principal is refused')((scope, expect) =>
          expect(scope.observed).toMatchObject({
            mine: {
              _tag: 'Completed',
              output: { _tag: 'Pending', owner: { _tag: 'Person', subject: 'alice' } },
            },
            theirs: { _tag: 'Refused', refusal: { _tag: 'OperationNotFound' } },
          })
        ),
      ),
    )
  })
