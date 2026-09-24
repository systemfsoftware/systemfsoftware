import { expect } from '@effect/vitest'
import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import * as Schema from 'effect/Schema'
import {
  type AnswerFor,
  answering,
  answersFor,
  CountingModel,
  probabilityAnswer,
  withProvider,
} from './__fixtures__/counting-model.fixture.js'
import { Request } from './__fixtures__/request.schema.js'
import {
  matchedRouteOf,
  routingAnswer,
  RoutingSight,
  routingTo,
  watchingRouting,
} from './__fixtures__/routing-model.fixture.js'

const Feature = makeFeature({ it })

const find = Discern.Procedure.make({
  description: 'Locate code relevant to a behavior, feature or concept',
  examples: ['Find where retries are implemented'],
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

const odd = Discern.Procedure.make({
  description: 'A procedure with an awkward name',
  input: Request,
  run: () => Effect.succeed('odd'),
})

const oddRegistry = Discern.Procedure.registry(Request, { ['__proto__']: odd, find })

const awkwardPreferences = Object.fromEntries([
  ['__proto__', 0.9],
  ['find', 0.1],
])

const measuredModel: AnswerFor = (request) =>
  answersFor({
    request,
    answerOf: (decision) =>
      routingAnswer({
        preferences: request.state === 'where is auth'
          ? { find: 0.9, review: 0.05, 'test-gaps': 0.05 }
          : { find: 0.05, review: 0.9, 'test-gaps': 0.05 },
        decision,
      }),
  })

const risk = Discern.on(Request).probability({ id: 'risk', instructions: 'Risky' })

const auditor = Discern.Procedure.make({
  description: 'Audit a change for risk',
  input: Request,
  run: (request) =>
    Effect.map(Discern.ask(risk, request), (answer) => `${answer.probability > 0.8 ? 'risky' : 'safe'}:${request}`),
})

const auditRegistry = Discern.Procedure.registry(Request, { audit: auditor, find })

const auditingModel: AnswerFor = (request) =>
  answersFor({
    request,
    answerOf: (decision, id) =>
      id === 'risk' ? probabilityAnswer(0.95) : routingAnswer({ preferences: { audit: 0.9, find: 0.1 }, decision }),
  })

const urgent = Discern.on(Request).probability({ id: 'urgent', instructions: 'Urgent' })

const triage = Discern.Procedure.make({
  description: 'Decide how soon a request needs attention',
  input: Request,
  run: (request) =>
    Effect.map(Discern.ask(urgent, request), (answer) => `${answer.probability > 0.8 ? 'now' : 'later'}:${request}`),
})

const triageRegistry = Discern.Procedure.registry(Request, { triage, find })

const triageModel: AnswerFor = (request) =>
  answersFor({
    request,
    answerOf: (decision, id) =>
      id === 'urgent' ? probabilityAnswer(0.95) : routingAnswer({ preferences: { triage: 0.9, find: 0.1 }, decision }),
  })

const onlyFor = (side: string) =>
  Discern.Procedure.make({
    description: `Handle ${side} requests`,
    input: Request,
    eligible: (request) => request === side,
    run: (request) => Effect.succeed(request),
  })

const spelledAlike = Discern.Procedure.registry(Request, {
  a: onlyFor('right'),
  ab: onlyFor('left'),
  bc: onlyFor('right'),
  c: onlyFor('left'),
})

Feature('Routing a request to the procedure that handles it')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A procedure answers on its own, with no model involved',
      Gherkin.Do.pipe(
        Given('a procedure for locating code')('procedure', () => Effect.succeed(find)),
        When('a request is handed to the procedure directly')('answer', (s) => s.procedure.run('retries')),
        Then('the procedure body answers by itself')(({ answer }) => {
          expect(answer).toBe('found:retries')
        }),
      ),
    )

    scenario(
      'A request that clearly fits one procedure is routed to it',
      { scenarioLayer: answering(routingTo({ find: 0.05, review: 0.1, 'test-gaps': 0.85 })) },
      Gherkin.Do.pipe(
        Given('a registry of three code procedures')('registry', () => Effect.succeed(code)),
        When('a request that is clearly about test coverage is handed to the registry')(
          'answer',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              return yield* withProvider(s.registry.invoke('check my tests'), model.model)
            }),
        ),
        Then('the request reaches the procedure that finds test gaps')(({ answer }) => {
          expect(answer).toBe('gaps:check my tests')
        }),
      ),
    )

    scenario(
      'Routing reports the whole distribution, not just the winner',
      { scenarioLayer: answering(routingTo({ find: 0.8, review: 0.15, 'test-gaps': 0.05 })) },
      Gherkin.Do.pipe(
        Given('a registry of three code procedures')('registry', () => Effect.succeed(code)),
        When('the routing choice for a request is read')('route', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.registry.route('where is auth'), model.model)
          })),
        Then('the leader travels with its probability, its lead, and the full ranking')(({ route }) => {
          const matched = matchedRouteOf(route)
          expect(matched.id).toBe('find')
          expect(matched.probability).toBe(0.8)
          expect(Math.round(matched.margin * 100) / 100).toBe(0.65)
          expect(matched.ranked.map((candidate) => candidate.id)).toStrictEqual(['find', 'review', 'test-gaps'])
        }),
      ),
    )

    scenario(
      'The routing question can be measured over labelled examples like any other question',
      { scenarioLayer: answering(measuredModel) },
      Gherkin.Do.pipe(
        Given('the question of whether a request is about finding code')(
          'question',
          () => Effect.succeed(code.decision.is('find', { match: 0.7, margin: 0.15 })),
        ),
        When('the question is measured over two labelled requests')('report', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(
              Discern.Eval.run(Request, s.question, [
                { input: 'where is auth', expected: true },
                { input: 'review this diff', expected: false },
              ]),
              model.model,
            )
          })),
        Then('every example is judged correctly, with nothing left uncertain')(({ report }) => {
          if (Schema.is(Discern.EvalReport)(report)) {
            expect(report.metrics.accuracy).toBe(1)
            expect(report.metrics.uncertain).toBe(0)
          }
        }),
      ),
    )

    scenario(
      'Answers the procedures ask for are filed under the procedure that asked',
      { scenarioLayer: answering(auditingModel) },
      Gherkin.Do.pipe(
        Given('a registry where one procedure audits risk with its own question')(
          'registry',
          () => Effect.succeed(auditRegistry),
        ),
        Given('a recording of everything the model said')('observations', () => Effect.succeed(Discern.Model.store())),
        When('a request is routed and then audited')('answer', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.registry.invoke('deploy on friday'), model.model, [
              Discern.Model.recording(s.observations),
            ])
          })),
        Then('the recording keeps routing and the audit in separate folders')((s) =>
          Effect.gen(function*() {
            expect(s.answer).toBe('risky:deploy on friday')
            const tree = Discern.Model.tree(yield* Discern.Model.snapshot(s.observations), 'invoke')
            expect(tree.observations).toStrictEqual([])
            expect(
              tree.children.map((
                child,
              ) => [child.name, child.observations.map((observation) => observation.decisionId)]),
            ).toStrictEqual([['route', [auditRegistry.decision.id]], ['audit', ['risk']]])
          })
        ),
      ),
    )

    scenario(
      'A whole invocation replays from one recording, routing and body work included',
      { scenarioLayer: answering(triageModel) },
      Gherkin.Do.pipe(
        Given('a registry whose procedure asks its own urgency question')(
          'registry',
          () => Effect.succeed(triageRegistry),
        ),
        Given('a recording of everything the model said')('observations', () => Effect.succeed(Discern.Model.store())),
        When('a production outage is triaged with recording on')('answer', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.registry.invoke('prod is down'), model.model, [
              Discern.Model.recording(s.observations),
            ])
          })),
        Then('the whole invocation replays without asking the model again')((s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            expect(s.answer).toBe('now:prod is down')
            expect(model.calls()).toBe(2)
            const replayed = yield* Effect.provide(
              s.registry.invoke('prod is down'),
              Discern.Model.replayLayer(yield* Discern.Model.snapshot(s.observations)),
            )
            expect(replayed).toBe('now:prod is down')
            expect(model.calls()).toBe(2)
          })
        ),
      ),
    )

    scenario(
      'A member is found under its own name in the registry',
      Gherkin.Do.pipe(
        Given('a registry of two code procedures')('registry', () => Effect.succeed(code)),
        When('the member held under a name is read')('found', (s) => Effect.sync(() => s.registry.get('find'))),
        Then('the member under that name is the one the registry holds')((s) => {
          expect(s.found).toBe(find)
          expect(s.registry.ids).toStrictEqual(['find', 'review', 'test-gaps'])
        }),
      ),
    )

    scenario(
      'An id that collides with the object prototype still routes',
      { scenarioLayer: answering(routingTo(awkwardPreferences)) },
      Gherkin.Do.pipe(
        Given('a registry holding a procedure with a prototype-colliding id')(
          'registry',
          () => Effect.succeed(oddRegistry),
        ),
        When('a request is routed between it and another procedure')('answer', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.registry.invoke('x'), model.model)
          })),
        Then('the awkwardly named procedure is offered and chosen')((s) => {
          expect(s.registry.decision.labels).toStrictEqual(['__proto__', 'find'])
          expect(s.answer).toBe('odd')
        }),
      ),
    )

    scenario(
      'Two requests whose eligible procedures spell the same letters are each offered their own choices',
      { scenarioLayer: watchingRouting({ a: 0.9, ab: 0.9, bc: 0.1, c: 0.1 }) },
      Gherkin.Do.pipe(
        Given('a registry holding procedures named "a", "ab", "bc" and "c"')(
          'registry',
          () => Effect.succeed(spelledAlike),
        ),
        When('a "left" request is routed, and then a "right" request')('routes', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            const left = yield* withProvider(s.registry.route('left'), model.model)
            const right = yield* withProvider(s.registry.route('right'), model.model)
            return [left, right]
          })),
        Then('the model was offered "ab" and "c" for the first, and "a" and "bc" for the second')((s) =>
          Effect.gen(function*() {
            const sight = yield* RoutingSight
            expect(sight.offered()).toStrictEqual([['ab', 'c'], ['a', 'bc']])
            expect(s.routes.map((route) => matchedRouteOf(route).id)).toStrictEqual(['ab', 'a'])
          })
        ),
      ),
    )
  })
