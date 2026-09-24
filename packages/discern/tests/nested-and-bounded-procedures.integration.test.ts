import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { Effect, Layer, MutableRef, Option } from 'effect'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import {
  type AnswerFor,
  answering,
  answersFor,
  CountingModel,
  withProvider,
} from './__fixtures__/counting-model.fixture.js'
import { Request } from './__fixtures__/request.schema.js'
import { refusalOf, routingAnswer, routingTo } from './__fixtures__/routing-model.fixture.js'

const Feature = makeFeature({ it })

type RoutingFailure =
  | AiError.AiError
  | Discern.DecisionIdCollisionError
  | Discern.Procedure.ProcedureCommandRejectedError
  | Discern.Procedure.RoutingUncertainError
  | Discern.Procedure.NoEligibleProcedureError
  | Discern.Procedure.DepthExceededError

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

const lint = Discern.Procedure.make({
  description: 'Check style and formatting',
  input: Request,
  run: () => Effect.succeed('linted'),
})

const codeGroup = Discern.Procedure.registry(Request, { find, review }, { id: 'code-route' })

const code = Discern.Procedure.fromRegistry({
  description: 'Anything about reading or reviewing source code',
  registry: codeGroup,
})

const top = Discern.Procedure.registry(Request, { code, lint }, { id: 'top-route' })

const nestedModel: AnswerFor = (request) => {
  const asked = Object.keys(request.decisions).at(0) ?? ''
  return answersFor({
    request,
    answerOf: (decision) =>
      routingAnswer({
        preferences: asked === 'top-route' ? { code: 0.9, lint: 0.1 } : { find: 0.05, review: 0.95 },
        decision,
      }),
  })
}

const backToRegistry = MutableRef.make<
  ((request: string) => Effect.Effect<string, RoutingFailure, DecisionModel.DecisionModel>) | undefined
>(undefined)

const loop = Discern.Procedure.make({
  description: 'Routes straight back to the registry it belongs to',
  input: Request,
  run: (request) =>
    Option.match(Option.fromUndefinedOr(MutableRef.get(backToRegistry)), {
      onNone: () => Effect.die(new Error('the self-routing registry was read before it was built')),
      onSome: (invoke) => invoke(request),
    }),
})

const loopRegistry = Discern.Procedure.registry(Request, { loop, find })

const invokeSelf = (request: string): Effect.Effect<string, RoutingFailure, DecisionModel.DecisionModel> =>
  loopRegistry.invoke(request)

MutableRef.set(backToRegistry, invokeSelf)

const inner = Discern.Procedure.registry(Request, { find, review }, { id: 'inner' })

const solo = Discern.Procedure.make({
  description: 'The only procedure on offer',
  input: Request,
  run: (request) => Effect.succeed(`found:${request}`),
})

Feature('Nesting registries and bounding how deep routing may recurse')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A group of procedures is presented to its parent as one entry, so each level asks its own short question',
      { scenarioLayer: answering(nestedModel) },
      Gherkin.Do.pipe(
        Given('a group of code procedures nested inside a top-level registry')('registry', () => Effect.succeed(top)),
        Given('a recording of everything the model said')('observations', () => Effect.succeed(Discern.Model.store())),
        When('a request descends through both levels')('answer', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.registry.invoke('is this diff safe'), model.model, [
              Discern.Model.recording(s.observations),
            ])
          })),
        Then('each level asked separately, and the inner question is filed under the group')((s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            expect(s.answer).toBe('reviewed:is this diff safe')
            expect(model.asked()).toStrictEqual([['top-route'], ['code-route']])
            const tree = Discern.Model.tree(yield* Discern.Model.snapshot(s.observations), 'top')
            expect(tree.children.map((child) => child.name)).toStrictEqual(['route', 'code'])
            expect(tree.children.at(1)?.children.map((child) => child.name)).toStrictEqual(['route'])
          })
        ),
      ),
    )

    scenario(
      'A procedure that routes back into its own registry is stopped by a depth limit',
      { scenarioLayer: answering(routingTo({ loop: 0.95, find: 0.05 })) },
      Gherkin.Do.pipe(
        Given('a registry holding a procedure that routes straight back into it')(
          'registry',
          () => Effect.succeed(loopRegistry),
        ),
        When('the request is allowed at most three levels of routing')('refused', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* Effect.flip(
              withProvider(Discern.Procedure.withMaxDepth(3)(s.registry.invoke('x')), model.model),
            )
          })),
        Then('routing stops at the third level instead of recursing forever')((s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            expect(s.refused).toMatchObject({ _tag: 'DepthExceededError', limit: 3 })
            expect(model.calls()).toBe(3)
          })
        ),
      ),
    )

    scenario(
      'Two sibling requests each start from the caller depth, not a shared tally',
      { scenarioLayer: answering(routingTo({ find: 0.9, review: 0.1 })) },
      Gherkin.Do.pipe(
        Given('a registry of two code procedures')('registry', () => Effect.succeed(inner)),
        When('two sibling requests run side by side under a one-level limit')('answers', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(
              Discern.Procedure.withMaxDepth(1)(Effect.all([s.registry.invoke('a'), s.registry.invoke('b')])),
              model.model,
            )
          })),
        Then('both siblings answer, each having used its own single level')(({ answers }) => {
          expect(answers).toStrictEqual(['found:a', 'found:b'])
        }),
      ),
    )

    scenario(
      'A registry too small to route between is refused at construction',
      Gherkin.Do.pipe(
        When('a registry is asked to carry a single procedure')(
          'refusal',
          () => Effect.succeed(refusalOf(() => Discern.Procedure.registry(Request, { solo }))),
        ),
        Then('the build is refused, naming what went wrong')((s) => {
          expect(s.refusal.message).toContain('at least two labels')
        }),
      ),
    )
  })
