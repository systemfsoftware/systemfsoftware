import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Schema } from 'effect'
import { expect } from 'vitest'
import { answering, CountingModel, withProvider } from './__fixtures__/counting-model.fixture.js'
import { ReleaseTicket, ticket } from './__fixtures__/release-ticket.schema.js'
import {
  matchedRouteOf,
  noneRouteOf,
  RoutingSight,
  routingTo,
  watchingRouting,
} from './__fixtures__/routing-model.fixture.js'

const Feature = makeFeature({ it, layer })

const inspect = Discern.Procedure.make({
  description: 'Look at what a ticket is about',
  input: ReleaseTicket,
  run: (request) => Effect.succeed(`inspected:${request.ask}`),
})

const deploy = Discern.Procedure.make({
  description: 'Release the change described by a ticket',
  input: ReleaseTicket,
  eligible: (request) => request.environment !== 'local',
  run: (request) => Effect.succeed(`deployed:${request.environment}`),
})

const escalate = Discern.Procedure.make({
  description: 'Hand the ticket to a human',
  input: ReleaseTicket,
  run: () => Effect.succeed('escalated'),
})

const rollback = Discern.Procedure.make({
  description: 'Undo the last release',
  input: ReleaseTicket,
  eligible: (request) => request.environment !== 'local',
  run: () => Effect.succeed('rolled-back'),
})

const projected = Discern.Procedure.registry(ReleaseTicket, { inspect, deploy, rollback }, {
  routeBy: { schema: Schema.String, select: (request) => request.ask },
})

const whole = Discern.Procedure.registry(ReleaseTicket, { inspect, deploy, rollback })

const offering = Discern.Procedure.registry(ReleaseTicket, { inspect, deploy, rollback, escalate }, {
  routeBy: { schema: Schema.String, select: (request) => request.ask },
})

const releases = Discern.Procedure.registry(ReleaseTicket, { deploy, rollback }, {
  routeBy: { schema: Schema.String, select: (request) => request.ask },
})

const onlyInspect = Discern.Procedure.registry(ReleaseTicket, { deploy, inspect }, {
  routeBy: { schema: Schema.String, select: (request) => request.ask },
})

const preferences = { inspect: 0.9, deploy: 0.05, rollback: 0.05 }

Feature('Routing on a projection of the request instead of the whole of it')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Only the question of a ticket is shown to the router, never the attached evidence',
      { scenarioLayer: watchingRouting(preferences) },
      Gherkin.Do.pipe(
        Given('a registry that routes on just the question a ticket asks')('registry', () => Effect.succeed(projected)),
        When('a ticket carrying a large evidence blob is routed and run')('answer', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.registry.invoke(ticket({ ask: 'what is this about?' })), model.model)
          })),
        Then('the router was shown only the question, and routing is typed by the projection')((s) =>
          Effect.gen(function*() {
            const sight = yield* RoutingSight
            expect(s.answer).toBe('inspected:what is this about?')
            expect(sight.states()).toStrictEqual(['what is this about?'])
            expect(s.registry.routeInput).toBe(Schema.String)
          })
        ),
      ),
    )

    scenario(
      'Without a projection the router is shown the whole ticket',
      { scenarioLayer: watchingRouting(preferences) },
      Gherkin.Do.pipe(
        Given('the same procedures routed without a projection')('registry', () => Effect.succeed(whole)),
        When('the same ticket is routed and run')('answer', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.registry.invoke(ticket({ ask: 'what is this about?' })), model.model)
          })),
        Then('the router saw the whole ticket, evidence included')((s) =>
          Effect.gen(function*() {
            const sight = yield* RoutingSight
            expect(s.answer).toBe('inspected:what is this about?')
            expect(sight.states()).toStrictEqual([ticket({ ask: 'what is this about?' })])
          })
        ),
      ),
    )

    scenario(
      'Procedures that decline a situation are never offered to the router for it',
      { scenarioLayer: watchingRouting({ inspect: 0.9, deploy: 0.04, rollback: 0.03, escalate: 0.03 }) },
      Gherkin.Do.pipe(
        Given('a registry where two of four procedures decline to work locally')(
          'registry',
          () => Effect.succeed(offering),
        ),
        When('the same question is asked about a production ticket and a local one')(
          'answers',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              const production = yield* withProvider(
                s.registry.invoke(ticket({ ask: 'what is this?', environment: 'production' })),
                model.model,
              )
              const local = yield* withProvider(
                s.registry.invoke(ticket({ ask: 'what is this?', environment: 'local' })),
                model.model,
              )
              return { production, local }
            }),
        ),
        Then('the local question was put to the router without the two procedures that decline it')((s) =>
          Effect.gen(function*() {
            const sight = yield* RoutingSight
            expect(s.answers.production).toBe('inspected:what is this?')
            expect(s.answers.local).toBe('inspected:what is this?')
            expect(sight.offered()).toStrictEqual([
              ['inspect', 'deploy', 'rollback', 'escalate'],
              ['inspect', 'escalate'],
            ])
          })
        ),
      ),
    )

    scenario(
      'When nothing is eligible the route says so, and no model was asked',
      { scenarioLayer: answering(routingTo({ deploy: 0.5, rollback: 0.5 })) },
      Gherkin.Do.pipe(
        Given('a registry of two release procedures that both decline local work')(
          'registry',
          () => Effect.succeed(releases),
        ),
        When('a local ticket is read for routing')('route', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.registry.route(ticket({ ask: 'ship it', environment: 'local' })), model.model)
          })),
        When('the same local ticket is handed to the registry to run')('refused', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* Effect.flip(
              withProvider(s.registry.invoke(ticket({ ask: 'ship it', environment: 'local' })), model.model),
            )
          })),
        Then('the route names the situation and the invocation refuses, both without asking the model')((s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            expect(noneRouteOf(s.route).reason).toContain('no procedure is eligible')
            expect(s.refused).toMatchObject({ _tag: 'NoEligibleProcedureError' })
            expect(model.calls()).toBe(0)
          })
        ),
      ),
    )

    scenario(
      'One procedure left standing is chosen outright, without consulting the model',
      { scenarioLayer: answering(routingTo({ deploy: 0.5, rollback: 0.5 })) },
      Gherkin.Do.pipe(
        Given('a registry where only one member can always work')('registry', () => Effect.succeed(onlyInspect)),
        When('a local ticket is read for routing')('route', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.registry.route(ticket({ ask: 'ship it', environment: 'local' })), model.model)
          })),
        Then('the last procedure standing wins by elimination, and the model was never asked')((s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            const matched = matchedRouteOf(s.route)
            expect(matched.id).toBe('inspect')
            expect(matched.by).toBe('elimination')
            expect(model.calls()).toBe(0)
          })
        ),
      ),
    )

    scenario(
      'An invocation reports the choice it made next to the answer it produced',
      { scenarioLayer: answering(routingTo({ inspect: 0.05, deploy: 0.9, rollback: 0.05 })) },
      Gherkin.Do.pipe(
        Given('a registry that routes on just the question a ticket asks')('registry', () => Effect.succeed(projected)),
        When('a release request is invoked and its routing choice reported')('routed', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.registry.invokeWithRoute(ticket({ ask: 'please release this' })), model.model)
          })),
        Then('the choice names the winner, how it won, and the full ranking')(({ routed }) => {
          expect(routed.value).toBe('deployed:production')
          const matched = matchedRouteOf(routed.route)
          expect(matched.id).toBe('deploy')
          expect(matched.by).toBe('model')
          expect(matched.probability).toBe(0.9)
          expect(matched.ranked.map((candidate) => candidate.id)).toStrictEqual(['deploy', 'inspect', 'rollback'])
        }),
      ),
    )

    scenario(
      'The same question about different evidence reuses one routing answer',
      { scenarioLayer: answering(routingTo(preferences)) },
      Gherkin.Do.pipe(
        Given('a cache over model answers')(
          'cache',
          () => Effect.succeed([Discern.Model.caching(Discern.Model.store())]),
        ),
        Given('a registry that routes on just the question a ticket asks')('registry', () => Effect.succeed(projected)),
        When('the same question is asked twice about different evidence')('second', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            yield* withProvider(
              s.registry.invoke(ticket({ ask: 'what is this?', environment: 'production', evidence: 'diff A' })),
              model.model,
              s.cache,
            )
            return yield* withProvider(
              s.registry.invoke(ticket({ ask: 'what is this?', environment: 'production', evidence: 'diff B' })),
              model.model,
              s.cache,
            )
          })),
        Then('the second invocation routed from the cache, so the model was asked once')((s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            expect(s.second).toBe('inspected:what is this?')
            expect(model.calls()).toBe(1)
          })
        ),
      ),
    )
  })
