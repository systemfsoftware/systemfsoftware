import type { FeatureBody } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Effect, Equal, Fiber, Layer, Match, Option, Stream } from 'effect'
import type { Completed } from '../Answer/answer.schema.js'
import type { OperationState, SettlementAnswer } from '../Operations/operation-state.schema.js'
import { Operations } from '../Operations/operations.service.js'
import { Anonymous } from '../Principal/principal.schema.js'

const settledAnswer = (state: OperationState): SettlementAnswer | undefined =>
  Match.value(state).pipe(
    Match.tag('Settled', (settled) => settled.answer),
    Match.orElse(() => undefined),
  )

const lastSettledAnswer = (states: ReadonlyArray<OperationState>): SettlementAnswer | undefined =>
  Option.match(Arr.last(states), { onNone: () => undefined, onSome: settledAnswer })

const firstOrder: Completed = { _tag: 'Completed', output: { order: 1 }, next: [] }
const secondOrder: Completed = { _tag: 'Completed', output: { order: 2 }, next: [] }

export interface OperationStoreLaws {
  readonly title: string
  readonly layer: Layer.Layer<Operations>
  readonly body: FeatureBody<never, Operations, never>
}

export const operationStoreLaws = (operations: Layer.Layer<Operations>): OperationStoreLaws => ({
  title: 'The operation store obeys its laws',
  layer: operations,
  body: ({ scenario }) => {
    scenario(
      'a read after begin answers the pending operation the write recorded',
      Gherkin.Do.pipe(
        When('an anonymous owner begins an operation and reads it twice')('observed', () =>
          Effect.gen(function*() {
            const store = yield* Operations
            const id = yield* store.begin(new Anonymous({}))
            const first = yield* store.get(id)
            const second = yield* store.get(id)
            return { first, second, stable: Equal.equals(first, second) }
          })),
        Then('the two reads answer one stable pending anonymous operation')((scope, expect) =>
          expect(scope.observed).toMatchObject({
            stable: true,
            first: { _tag: 'Pending', owner: { _tag: 'Anonymous' } },
            second: { _tag: 'Pending' },
          })
        ),
      ),
    )

    scenario(
      'the same answer settles an operation once and repeats idempotently',
      Gherkin.Do.pipe(
        When('one answer settles an operation twice')('observed', () =>
          Effect.gen(function*() {
            const store = yield* Operations
            const id = yield* store.begin(new Anonymous({}))
            const answer: Completed = { _tag: 'Completed', output: { confirmed: true }, next: [] }
            const first = yield* store.settle(id, answer)
            const repeated = yield* store.settle(id, answer)
            const recorded = yield* store.get(id)
            return { first, repeated, recorded, answer }
          })),
        Then('the repeat equals the first settlement and the state holds the same answer')((scope, expect) =>
          expect({
            sameSettlement: Equal.equals(scope.observed.repeated, scope.observed.first),
            recordedOnce: Equal.equals(scope.observed.recorded, scope.observed.first),
            recordedAnswer: settledAnswer(scope.observed.recorded),
          }).toEqual({
            sameSettlement: true,
            recordedOnce: true,
            recordedAnswer: scope.observed.answer,
          })
        ),
      ),
    )

    scenario(
      'operations on distinct ids settle independently of the order they are settled in',
      Gherkin.Do.pipe(
        When('two operations settle in one order and two more settle the same answers swapped')(
          'observed',
          () =>
            Effect.gen(function*() {
              const store = yield* Operations
              const a = yield* store.begin(new Anonymous({}))
              const b = yield* store.begin(new Anonymous({}))
              const c = yield* store.begin(new Anonymous({}))
              const d = yield* store.begin(new Anonymous({}))
              yield* store.settle(a, firstOrder)
              yield* store.settle(b, secondOrder)
              yield* store.settle(d, secondOrder)
              yield* store.settle(c, firstOrder)
              const aState = yield* store.get(a)
              const bState = yield* store.get(b)
              const cState = yield* store.get(c)
              const dState = yield* store.get(d)
              return {
                a: settledAnswer(aState),
                b: settledAnswer(bState),
                c: settledAnswer(cState),
                d: settledAnswer(dState),
              }
            }),
        ),
        Then('each operation holds the answer it was settled with, whatever the order')((scope, expect) =>
          expect(scope.observed).toEqual({ a: firstOrder, b: secondOrder, c: firstOrder, d: secondOrder })
        ),
      ),
    )

    scenario(
      'a watched operation ends its stream at the settlement',
      Gherkin.Do.pipe(
        When('an operation is watched and then settled')('observed', () =>
          Effect.gen(function*() {
            const store = yield* Operations
            const id = yield* store.begin(new Anonymous({}))
            const watching = yield* Effect.forkChild(Stream.runCollect(store.watch(id)))
            const answer: Completed = { _tag: 'Completed', output: { done: true }, next: [] }
            yield* store.settle(id, answer)
            const states = yield* Fiber.join(watching)
            return { last: lastSettledAnswer(states), answer }
          })),
        Then('the collected stream ends on the settled answer')((scope, expect) =>
          expect(scope.observed.last).toEqual(scope.observed.answer)
        ),
      ),
    )
  },
})
