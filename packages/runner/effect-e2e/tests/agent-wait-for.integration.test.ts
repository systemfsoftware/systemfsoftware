import { Engine } from '@systemfsoftware/effect-e2e/engine'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'
import { TestClock } from 'effect/testing'

import {
  clockDrivenEngineLayer,
  failureShapeOf,
  failureTagOf,
  namesOn,
  ORDER_AMBIGUOUS_SITE,
  ORDER_CONFIRMED_SITE,
  ORDER_PARAGRAPH_SITE,
  ORDER_PENDING_SITE,
  type Plan,
  proposeCause,
  ran,
  resolveCheck,
  scriptedGateway,
} from './__fixtures__/judgment-sites.fixture.js'

const Feature = makeFeature({ it })

Feature('Waiting for a condition under the test clock')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'The wait passes once the clock passes the change',
      Gherkin.Do.pipe(
        Given('the confirmation shows only after seven seconds of test clock')('plan', () =>
          Effect.succeed(
            {
              engine: clockDrivenEngineLayer({
                before: ORDER_PENDING_SITE,
                after: ORDER_CONFIRMED_SITE,
                threshold: '7 seconds',
              }),
              path: '/order',
              kind: 'waitFor',
              sentence: 'the order is confirmed',
            } satisfies Omit<Plan, 'gateway'>,
          )),
        When('the wait runs while the clock reaches nine seconds')('state', (s) =>
          Effect.gen(function*() {
            const scripted = yield* scriptedGateway([
              resolveCheck({
                combine: 'all',
                literals: [{
                  predicate: 'text',
                  target: { role: 'heading', name: 'Order confirmed' },
                  match: 'contains',
                  value: 'Order confirmed',
                }],
              }),
            ])
            const fiber = yield* Effect.forkChild(ran({ ...s.plan, gateway: scripted.layer }))
            yield* TestClock.adjust('9 seconds')
            const result = yield* Fiber.join(fiber)
            return { ...result, requests: yield* scripted.requests }
          })),
        Then('the wait passes with one request and none for the unchanged screen')((s, expect) =>
          expect({
            outcome: Result.map(
              s.state.outcome,
              (result) => ({ modelCalls: result.modelCalls, lookup: result.lookup }),
            ),
            requests: s.state.requests.length,
            confirmed: namesOn(s.state.screen).includes('Order confirmed'),
          }).toEqual({
            outcome: Result.succeed({ modelCalls: 1, lookup: { _tag: 'Missed' } }),
            requests: 1,
            confirmed: true,
          })
        ),
      ),
    )

    scenario(
      'A changed but still unevaluable screen costs one more request',
      Gherkin.Do.pipe(
        Given('the confirmation names itself in text only after seven seconds')('plan', () =>
          Effect.succeed(
            {
              engine: clockDrivenEngineLayer({
                before: ORDER_PENDING_SITE,
                after: ORDER_PARAGRAPH_SITE,
                threshold: '7 seconds',
              }),
              path: '/order',
              kind: 'waitFor',
              sentence: 'the order is confirmed',
            } satisfies Omit<Plan, 'gateway'>,
          )),
        When('the wait runs while the clock reaches nine seconds')('state', (s) =>
          Effect.gen(function*() {
            const scripted = yield* scriptedGateway([
              resolveCheck({
                combine: 'all',
                literals: [{
                  predicate: 'text',
                  target: { role: 'heading', name: 'Order confirmed' },
                  match: 'contains',
                  value: 'Order confirmed',
                }],
              }),
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'text', target: { ref: 'note' }, match: 'contains', value: 'Order confirmed' }],
              }),
            ])
            const fiber = yield* Effect.forkChild(ran({ ...s.plan, gateway: scripted.layer }))
            yield* TestClock.adjust('9 seconds')
            const result = yield* Fiber.join(fiber)
            return { ...result, requests: yield* scripted.requests }
          })),
        Then('the wait passes with one request per distinct unevaluable screen')((s, expect) =>
          expect({
            outcome: Result.map(
              s.state.outcome,
              (result) => ({ modelCalls: result.modelCalls, lookup: result.lookup }),
            ),
            requests: s.state.requests.length,
          }).toEqual({
            outcome: Result.succeed({ modelCalls: 2, lookup: { _tag: 'Missed' } }),
            requests: 2,
          })
        ),
      ),
    )

    scenario(
      'A wait that times out before the change ends inconclusive',
      Gherkin.Do.pipe(
        Given('the confirmation shows only after seven seconds of test clock')('plan', () =>
          Effect.succeed(
            {
              engine: clockDrivenEngineLayer({
                before: ORDER_PENDING_SITE,
                after: ORDER_CONFIRMED_SITE,
                threshold: '7 seconds',
              }),
              path: '/order',
              kind: 'waitFor',
              sentence: 'the order is confirmed',
              timeout: '5 seconds',
            } satisfies Omit<Plan, 'gateway'>,
          )),
        When('the wait runs out at five seconds')('state', (s) =>
          Effect.gen(function*() {
            const scripted = yield* scriptedGateway([
              resolveCheck({
                combine: 'all',
                literals: [{
                  predicate: 'text',
                  target: { role: 'heading', name: 'Order confirmed' },
                  match: 'contains',
                  value: 'Order confirmed',
                }],
              }),
            ])
            const fiber = yield* Effect.forkChild(ran({ ...s.plan, gateway: scripted.layer }))
            yield* TestClock.adjust('5 seconds')
            const result = yield* Fiber.join(fiber)
            return { ...result, requests: yield* scripted.requests }
          })),
        Then('the wait ends ASSERTION_INCONCLUSIVE after one request')((s, expect) =>
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
      'A wait that stays false fails as a product failure',
      Gherkin.Do.pipe(
        Given('the status never stops saying the order is processing')('plan', () =>
          Effect.succeed(
            {
              engine: Engine.layerTest(ORDER_PENDING_SITE),
              path: '/order',
              kind: 'waitFor',
              sentence: 'the order says cancelled',
              timeout: '5 seconds',
            } satisfies Omit<Plan, 'gateway'>,
          )),
        When('the wait runs out at five seconds and the failure is classified')('state', (s) =>
          Effect.gen(function*() {
            const scripted = yield* scriptedGateway([
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'text', target: { ref: 'status' }, match: 'contains', value: 'Cancelled' }],
              }),
              proposeCause({
                cause: 'product',
                evidence: [{ ref: 'status' }],
                reason: 'the status keeps processing',
              }),
            ])
            const fiber = yield* Effect.forkChild(ran({ ...s.plan, gateway: scripted.layer }))
            yield* TestClock.adjust('5 seconds')
            const result = yield* Fiber.join(fiber)
            return { ...result, requests: yield* scripted.requests }
          })),
        Then('the wait fails ASSERTION_FAILED with cause product')((s, expect) =>
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
      'A wait with one model call left stops at the second screen',
      Gherkin.Do.pipe(
        Given('two distinct screens cannot evaluate the confirmation check')('plan', () =>
          Effect.succeed(
            {
              engine: clockDrivenEngineLayer({
                before: ORDER_PENDING_SITE,
                after: ORDER_AMBIGUOUS_SITE,
                threshold: '7 seconds',
              }),
              path: '/order',
              kind: 'waitFor',
              sentence: 'the order is confirmed',
              maxModelCalls: 1,
            } satisfies Omit<Plan, 'gateway'>,
          )),
        When('the screen changes after the only model call is spent')('state', (s) =>
          Effect.gen(function*() {
            const scripted = yield* scriptedGateway([
              resolveCheck({
                combine: 'all',
                literals: [{
                  predicate: 'text',
                  target: { role: 'heading', name: 'Order confirmed' },
                  match: 'contains',
                  value: 'Order confirmed',
                }],
              }),
            ])
            const fiber = yield* Effect.forkChild(ran({ ...s.plan, gateway: scripted.layer }))
            yield* TestClock.adjust('9 seconds')
            const result = yield* Fiber.join(fiber)
            return { ...result, requests: yield* scripted.requests }
          })),
        Then('the wait fails STEP_BUDGET_EXHAUSTED after exactly one request')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            requests: s.state.requests.length,
          }).toEqual({
            failure: 'STEP_BUDGET_EXHAUSTED',
            requests: 1,
          })
        ),
      ),
    )
  })
