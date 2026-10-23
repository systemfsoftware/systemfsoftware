import { Engine } from '@systemfsoftware/effect-e2e/engine'
import type { ModelAnswer } from '@systemfsoftware/effect-e2e/model'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import { TestClock } from 'effect/testing'

import { GREET_SITE } from './__fixtures__/agent-sites.fixture.js'
import {
  failureShapeOf,
  failureTagOf,
  proposalOf,
  proposeCause,
  ran,
  resolveCheck,
  scriptedThenSilentGateway,
  withRequests,
} from './__fixtures__/judgment-sites.fixture.js'

const Feature = makeFeature({ it })

Feature('Classifying a failed assertion')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A cited proposal rides on the failure record',
      Gherkin.Do.pipe(
        Given('a failing assertion whose classifier cites the greeting')('answers', () =>
          Effect.succeed(
            [
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value: 'Goodbye' }],
              }),
              proposeCause({
                cause: 'environment',
                evidence: [{ ref: 'hello' }],
                reason: 'the greeting may come from the environment',
              }),
            ] satisfies ReadonlyArray<ModelAnswer>,
          )),
        When('the statement is asserted')('state', (s) =>
          withRequests({
            plan: {
              engine: Engine.layerTest(GREET_SITE),
              path: '/greeted',
              kind: 'assert',
              sentence: 'the greeting says goodbye',
            },
            answers: s.answers,
          })),
        Then('the failure keeps its code and cause and carries the proposal')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            requests: s.state.requests.length,
            outcome: failureShapeOf(s.state.records[0]),
            proposed: proposalOf(s.state.records[0]),
          }).toEqual({
            failure: 'ASSERTION_FAILED',
            requests: 2,
            outcome: ['ASSERTION_FAILED', 'product'],
            proposed: {
              cause: 'environment',
              evidence: [{ _tag: 'NodeEvidence', ref: { id: 'hello', revision: '1' } }],
            },
          })
        ),
      ),
    )

    scenario(
      'A silent classifier never changes the verdict',
      Gherkin.Do.pipe(
        Given('a failing assertion against a classifier that never answers')('run', () =>
          Effect.gen(function*() {
            const scripted = yield* scriptedThenSilentGateway([
              resolveCheck({
                combine: 'all',
                literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value: 'Goodbye' }],
              }),
            ])
            return { gateway: scripted.layer, requests: scripted.requests }
          })),
        When('the clock passes the classifier bound')('state', (s) =>
          Effect.gen(function*() {
            const fiber = yield* Effect.forkChild(
              ran({
                engine: Engine.layerTest(GREET_SITE),
                path: '/greeted',
                kind: 'assert',
                sentence: 'the greeting says goodbye',
                timeout: '1 second',
                gateway: s.run.gateway,
              }),
            )
            yield* TestClock.adjust('2 seconds')
            const result = yield* Fiber.join(fiber)
            return { ...result, requests: yield* s.run.requests }
          })),
        Then('the step still fails ASSERTION_FAILED without a proposal')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            requests: s.state.requests.length,
            outcome: failureShapeOf(s.state.records[0]),
            proposed: proposalOf(s.state.records[0]),
          }).toEqual({
            failure: 'ASSERTION_FAILED',
            requests: 2,
            outcome: ['ASSERTION_FAILED', 'product'],
            proposed: null,
          })
        ),
      ),
    )
  })
