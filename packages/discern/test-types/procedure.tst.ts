import { Discern } from '@systemfsoftware/discern'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { describe, expect, it } from 'tstyche'

const Request = Schema.String

type UncertainRoute = Extract<Discern.Procedure.Route<string>, { readonly _tag: 'RouteUncertain' }>

const findCap = Discern.Procedure.make({
  id: 'find',
  description: 'Locate relevant code',
  input: Request,
  run: (request: string) => Effect.succeed(request.length),
})

const reviewCap = Discern.Procedure.make({
  id: 'review',
  description: 'Review a change',
  input: Request,
  run: () => Effect.succeed('reviewed' as const),
})

const code = Discern.Procedure.registry(Request, [findCap, reviewCap])

const Envelope = Schema.Struct({ ask: Schema.String, payload: Schema.String })

const readIt = Discern.Procedure.make({
  id: 'read',
  description: 'Read the payload',
  input: Envelope,
  run: (envelope) => Effect.succeed(envelope.payload),
})

const countIt = Discern.Procedure.make({
  id: 'count',
  description: 'Count the payload',
  input: Envelope,
  eligible: (envelope) => envelope.payload.length > 0,
  run: (envelope) => Effect.succeed(envelope.payload.length),
})

const envelopes = Discern.Procedure.registry(Envelope, [readIt, countIt], {
  routeBy: { schema: Schema.String, select: (envelope) => envelope.ask },
})

const numeric = Discern.Procedure.make({
  id: 'numeric',
  description: 'Takes a number',
  input: Schema.Number,
  run: (value: number) => Effect.succeed(value),
})

describe('the procedure registry', () => {
  it('Should_AcceptHomogeneousMembers_When_TheRegistryIsBuilt', () => {
    expect(Discern.Procedure.registry).type.toBeCallableWith(Request, [findCap, reviewCap])
  })

  it('Should_RejectAHeterogeneousMember_When_TheInputDiffers', () => {
    expect(Discern.Procedure.registry).type.toBeCallableWith(Request, [findCap, reviewCap])
    expect(Discern.Procedure.registry).type.not.toBeCallableWith(Request, [findCap, numeric])
  })

  it('Should_RejectASingleMember_When_OnlyOneProcedureIsOffered', () => {
    expect(Discern.Procedure.registry).type.toBeCallableWith(Request, [findCap, reviewCap])
    expect(Discern.Procedure.registry).type.not.toBeCallableWith(Request, [findCap])
  })

  it('Should_KeepIdsLiteral_When_AGetIsCheckedAgainstMembership', () => {
    expect(code.get).type.toBeCallableWith('find')
    expect(code.get).type.not.toBeCallableWith('test-gaps')
    expect(code.get('find')).type.toBe<typeof findCap>()
    expect(code.ids).type.toBe<ReadonlyArray<'find' | 'review'>>()
  })

  it('Should_UnionTheMemberOutputs_When_Invoked', () => {
    expect(code.invoke).type.toBeCallableWith('x')
    expect(code.invoke('x')).type.toBe<
      Effect.Effect<
        number | 'reviewed',
        | AiError.AiError
        | AiError.InvalidRequestError
        | Discern.Procedure.NoEligibleProcedureError
        | Discern.Procedure.DepthExceededError
        | Discern.Procedure.RoutingUncertainError,
        DecisionModel.DecisionModel
      >
    >()
    expect(code.invoke('x')).type.not.toBeAssignableTo<
      Effect.Effect<number | 'reviewed', AiError.AiError, DecisionModel.DecisionModel>
    >()
  })

  it('Should_WidenTheSuccessType_When_AValueFallbackIsGiven', () => {
    const uncertainOf = (input: string, route: UncertainRoute): 'escalated' => {
      expect(input).type.toBe<string>()
      expect(route._tag).type.toBe<'RouteUncertain'>()
      return 'escalated'
    }
    expect(code.invoke).type.toBeCallableWith('x', { onUncertain: uncertainOf })
    expect(code.invoke('x', { onUncertain: () => 'escalated' as const })).type.toBe<
      Effect.Effect<
        number | 'reviewed' | 'escalated',
        | AiError.AiError
        | AiError.InvalidRequestError
        | Discern.Procedure.NoEligibleProcedureError
        | Discern.Procedure.DepthExceededError,
        DecisionModel.DecisionModel
      >
    >()
  })

  it('Should_WidenTheSuccessType_When_AnEffectFallbackIsGiven', () => {
    const uncertainEffectOf = (input: string, route: UncertainRoute): Effect.Effect<'escalated'> => {
      expect(input).type.toBe<string>()
      expect(route._tag).type.toBe<'RouteUncertain'>()
      return Effect.succeed('escalated' as const)
    }
    expect(code.invoke).type.toBeCallableWith('x', { onUncertain: uncertainEffectOf })
    expect(code.invoke('x', { onUncertain: () => Effect.succeed('escalated' as const) })).type.toBe<
      Effect.Effect<
        number | 'reviewed' | 'escalated',
        | AiError.AiError
        | AiError.InvalidRequestError
        | Discern.Procedure.NoEligibleProcedureError
        | Discern.Procedure.DepthExceededError,
        DecisionModel.DecisionModel
      >
    >()
  })

  it('Should_CarryTheFullRanking_When_Routing', () => {
    expect(code.route).type.toBeCallableWith('x')
    expect(code.route('x')).type.toBe<
      Effect.Effect<Discern.Procedure.Route<'find' | 'review'>, AiError.AiError, DecisionModel.DecisionModel>
    >()
    expect(
      code.route('x').pipe(
        Effect.map((route) => {
          expect(route).type.toBe<Discern.Procedure.Route<'find' | 'review'>>()
          switch (route._tag) {
            case 'RouteMatched':
              return `${route.id} by ${route.by}`
            case 'RouteUncertain':
              return route.ranked[0]?.id ?? 'nobody'
            case 'RouteNone':
              return route.reason
          }
        }),
      ),
    ).type.toBe<Effect.Effect<string, AiError.AiError, DecisionModel.DecisionModel>>()
  })
})

describe('the projected registry', () => {
  it('Should_TypeTheDecisionByTheProjection_When_RouteBySelectsPartOfTheInput', () => {
    expect(envelopes.decision).type.toBe<Discern.ClassifyDecision<string, string, typeof Schema.String>>()
  })

  it('Should_SurfaceTheSelectionNextToTheResult_When_InvokedWithRoute', () => {
    expect(envelopes.invokeWithRoute).type.toBeCallableWith({ ask: 'read it', payload: 'x' })
    expect(
      envelopes.invokeWithRoute({ ask: 'read it', payload: 'x' }).pipe(
        Effect.map(({ route, value }) => (route._tag === 'RouteMatched' ? `${route.id}:${String(value)}` : '?')),
      ),
    ).type.toBe<
      Effect.Effect<
        string,
        | AiError.AiError
        | AiError.InvalidRequestError
        | Discern.Procedure.NoEligibleProcedureError
        | Discern.Procedure.DepthExceededError
        | Discern.Procedure.RoutingUncertainError,
        DecisionModel.DecisionModel
      >
    >()
  })
})
