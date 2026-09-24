import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { answering, CountingModel, withProvider } from './__fixtures__/counting-model.fixture.js'
import { Request } from './__fixtures__/request.schema.js'
import { matchedRouteOf, routingTo, uncertainRouteOf } from './__fixtures__/routing-model.fixture.js'

const Feature = makeFeature({ it })

const find = Discern.Procedure.make({
  description: 'Locate code relevant to a behavior, feature or concept',
  input: Request,
  run: (request) => Effect.succeed(`found:${request}`),
})

const review = Discern.Procedure.make({
  description: 'Review a change for correctness and semantic risk',
  input: Request,
  run: (request) => Effect.succeed(`reviewed:${request}`),
})

const testGaps = Discern.Procedure.make({
  description: 'Find behavior that lacks sufficient test coverage',
  input: Request,
  run: (request) => Effect.succeed(`gaps:${request}`),
})

const code = Discern.Procedure.registry(Request, { find, review, ['test-gaps']: testGaps })

Feature('Owning up when a request cannot be routed confidently')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A near-tie is reported as uncertainty rather than decided by a hair',
      { scenarioLayer: answering(routingTo({ find: 0.31, review: 0.34, 'test-gaps': 0.35 })) },
      Gherkin.Do.pipe(
        Given('a registry of three code procedures')('registry', () => Effect.succeed(code)),
        When('a request that fits all three about equally is read for routing')('route', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.registry.route('do something'), model.model)
          })),
        Then('the doubt is named and the whole distribution is reported in order')(({ route }, expect) => {
          const uncertain = uncertainRouteOf(route)
          return expect({
            reason: uncertain.reason,
            ranked: uncertain.ranked.map((candidate) => candidate.id),
          }).toEqual({
            reason: expect.stringMatching(/no procedure reached 0\.7/),
            ranked: ['test-gaps', 'review', 'find'],
          })
        }),
      ),
    )

    scenario(
      'A clear leader with too small a lead is still reported as uncertainty',
      { scenarioLayer: answering(routingTo({ find: 0.44, review: 0.46, 'test-gaps': 0.1 })) },
      Gherkin.Do.pipe(
        Given('a registry of three code procedures')('registry', () => Effect.succeed(code)),
        When('the request is read with a lower bar for certainty')('route', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(
              s.registry.route('ambiguous', { minProbability: 0.4, minMargin: 0.15 }),
              model.model,
            )
          })),
        Then('the refusal names the leader, the runner-up, and how narrow the lead was')(({ route }, expect) =>
          expect(uncertainRouteOf(route).reason).toMatch(/led find by only 0\.020/)
        ),
      ),
    )

    scenario(
      'An impossible request is refused rather than guessed, unless the caller has a plan',
      { scenarioLayer: answering(routingTo({ find: 0.33, review: 0.34, 'test-gaps': 0.33 })) },
      Gherkin.Do.pipe(
        Given('a registry of three code procedures')('registry', () => Effect.succeed(code)),
        When('the request is handed over with no plan for doubt')('refused', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* Effect.flip(withProvider(s.registry.invoke('???'), model.model))
          })),
        When('the request is handed over with a person to ask')('handled', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(
              s.registry.invoke('???', {
                onUncertain: (_input, route) => `ask-a-human:${route.ranked.at(0)?.id ?? 'nobody'}`,
              }),
              model.model,
            )
          })),
        When('the plan itself needs to ask something before answering')('answered', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(
              s.registry.invoke('???', { onUncertain: () => Effect.succeed('ask-a-human:from-effect') }),
              model.model,
            )
          })),
        Then('the refusal reports the ranking, and both plans answer instead')((s, expect) =>
          expect({
            refused: s.refused,
            handled: s.handled,
            answered: s.answered,
          }).toMatchObject({
            refused: {
              _tag: 'RoutingUncertainError',
              ranked: [{ id: 'review' }, { id: 'find' }, { id: 'test-gaps' }],
            },
            handled: 'ask-a-human:review',
            answered: 'ask-a-human:from-effect',
          })
        ),
      ),
    )

    scenario(
      'How much certainty a request needs is decided per call',
      { scenarioLayer: answering(routingTo({ find: 0.55, review: 0.3, 'test-gaps': 0.15 })) },
      Gherkin.Do.pipe(
        Given('a registry of three code procedures')('registry', () => Effect.succeed(code)),
        When('the request is read under the default bar')('strict', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.registry.route('x'), model.model)
          })),
        When('the same request is read with the bar lowered')('relaxed', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(
              s.registry.route('x', { minProbability: 0.5, minMargin: 0.2 }),
              model.model,
            )
          })),
        Then('a hesitant leader is doubted by default and accepted once the bar is lowered')((s, expect) =>
          expect({
            strictReason: uncertainRouteOf(s.strict).reason,
            relaxedWinner: matchedRouteOf(s.relaxed).id,
          }).toEqual({
            strictReason: expect.stringMatching(/no procedure reached 0\.7/),
            relaxedWinner: 'find',
          })
        ),
      ),
    )
  })
