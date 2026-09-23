import * as Discern from '@systemfsoftware/discern'
import * as Procedure from '@systemfsoftware/discern/procedure'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { describe, expect, it } from 'tstyche'

const Change = Discern.on(Schema.String)

const impact = Change.classify({
  id: 'impact',
  instructions: 'Classify API impact',
  criteria: {
    none: 'none',
    additive: 'additive',
    behavioral: 'behavioral',
    breaking: 'breaking',
  },
})

const risky = Change.probability({ instructions: 'Likely to regress' })
const severe = Change.rate({
  instructions: 'Rate severity',
  criteria: ['low', 'medium', 'high'] as const,
})

const matcher = Discern.type(Schema.String).pipe(
  Discern.when(
    Discern.and(impact.is('breaking'), risky.above(0.8, { missBelow: 0.5 })),
    (input) => input.toUpperCase(),
  ),
  Discern.when(severe.atLeast('medium'), (input) => Effect.succeed(input.length)),
  Discern.onUncertain((input: string) => `review:${input}`),
  Discern.orElse((input) => input.length > 0),
)

const matchedAll = Discern.match(impact).pipe(
  Discern.case('none', () => 0),
  Discern.case('additive', () => 1),
  Discern.case('behavioral', () => 2),
  Discern.case('breaking', () => 3),
)

const incomplete = Discern.match(impact).pipe(
  Discern.case('none', () => 0),
  Discern.case('additive', () => 1),
)

const exhaustive = matchedAll.pipe(Discern.exhaustive)

const immediate = Discern.value(Schema.String, 'change').pipe(
  Discern.when(impact.is('breaking'), (input) => input.toUpperCase()),
  Discern.orElse((input: string) => input),
)

// --- DecisionModel middleware -------------------------------------------------

const observations = Discern.Model.store()
const spend = Discern.Model.budget({ decisions: 20, calls: 4 })

// --- Procedures -------------------------------------------------------------

const Request = Schema.String

const findCap = Procedure.make({
  id: 'find',
  description: 'Locate relevant code',
  input: Request,
  run: (request: string) => Effect.succeed(request.length),
})

const reviewCap = Procedure.make({
  id: 'review',
  description: 'Review a change',
  input: Request,
  run: () => Effect.succeed('reviewed' as const),
})

const code = Procedure.registry(Request, [findCap, reviewCap])

const Envelope = Schema.Struct({ ask: Schema.String, payload: Schema.String })
const readIt = Procedure.make({
  id: 'read',
  description: 'Read the payload',
  input: Envelope,
  run: (envelope) => Effect.succeed(envelope.payload),
})
const countIt = Procedure.make({
  id: 'count',
  description: 'Count the payload',
  input: Envelope,
  eligible: (envelope) => envelope.payload.length > 0,
  run: (envelope) => Effect.succeed(envelope.payload.length),
})
const envelopes = Procedure.registry(Envelope, [readIt, countIt], {
  routeBy: { schema: Schema.String, select: (envelope) => envelope.ask },
})

const numeric = Procedure.make({
  id: 'numeric',
  description: 'Takes a number',
  input: Schema.Number,
  run: (value: number) => Effect.succeed(value),
})

describe('the labels a classification accepts', () => {
  it('Should_AcceptAKnownLabel_When_NoThresholdsAreGiven', () => {
    expect(impact.is).type.toBeCallableWith('breaking')
  })

  it('Should_AcceptAKnownLabel_When_ThresholdsAreGiven', () => {
    expect(impact.is).type.toBeCallableWith('breaking', { match: 0.8, miss: 0.2, margin: 0.1 })
  })

  it('Should_RejectAnUnknownLabel_When_ItIsNotInTheCriteria', () => {
    // unknown labels are rejected
    expect(impact.is).type.toBeCallableWith('breaking')
    expect(impact.is).type.not.toBeCallableWith('critical')
  })
})

describe('the thresholds probability and rate bands accept', () => {
  it('Should_AcceptABandThreshold_When_AProbabilityMissBelowIsGiven', () => {
    expect(risky.above).type.toBeCallableWith(0.8, { missBelow: 0.5 })
    expect(risky.above).type.not.toBeCallableWith('high')
  })

  it('Should_AcceptAKnownLevel_When_AnOrderedRatingIsRequested', () => {
    expect(severe.atLeast).type.toBeCallableWith('medium')
    expect(severe.atLeast).type.not.toBeCallableWith('critical')
  })
})

describe('the finished reusable matcher', () => {
  it('Should_InferThePolicy_When_EveryCaseHasAHandler', () => {
    expect(matcher).type.toBe<
      Discern.Policy<string, string | number | boolean, never, never, typeof Schema.String>
    >()
  })

  it('Should_AcceptTheInput_When_AllCasesAreFinished', () => {
    expect(matcher).type.toBeCallableWith('change')
    expect(matcher).type.not.toBeCallableWith(42)
  })

  it('Should_ExposeThePlan_When_TheMatcherIsFinished', () => {
    expect(matcher).type.toHaveProperty('plan')
  })

  it('Should_AcceptTheInput_When_TheTraceIsRequested', () => {
    expect(matcher.runWithTrace).type.toBeCallableWith('change')
  })
})

describe('the exhaustive classification match', () => {
  it('Should_AcceptTheFinishedClassification_When_EveryLabelIsHandled', () => {
    expect(Discern.exhaustive).type.toBeCallableWith(matchedAll)
  })

  it('Should_RejectAnIncompleteClassification_When_ALabelIsMissing', () => {
    // exhaustive is unavailable until all labels are handled
    expect(Discern.exhaustive).type.toBeCallableWith(matchedAll)
    expect(Discern.exhaustive).type.not.toBeCallableWith(incomplete)
  })

  it('Should_InferTheTotalPolicy_When_TheLabelsAreExhausted', () => {
    expect(exhaustive).type.toBe<
      Discern.Policy<string, number, Discern.ExhaustiveMatchError, never, typeof Schema.String>
    >()
    expect(exhaustive).type.toBeCallableWith('change')
  })
})

describe('the immediate value match', () => {
  it('Should_YieldAnEffect_When_TheValueFlavorIsFinished', () => {
    expect(immediate).type.toBe<
      Effect.Effect<string, AiError.AiError | Discern.UncertainMatchError, DecisionModel.DecisionModel>
    >()
  })
})

describe('the DecisionModel middleware', () => {
  it('Should_AcceptAProviderAndAnInterceptorStack_When_TheLayerIsBuilt', () => {
    expect(Discern.Model.layer).type.toBeCallableWith(Discern.Model.unavailable, [
      Discern.Model.recording(observations),
      Discern.Model.caching(observations),
      Discern.Model.budgeted(spend),
    ])
  })

  it('Should_AcceptASnapshotOrALiveStore_When_AReplayLayerIsBuilt', () => {
    expect(Discern.Model.replayLayer).type.toBeCallableWith(observations.snapshot())
    expect(Discern.Model.replayLayer).type.toBeCallableWith(observations)
  })

  // Replay accepts either a snapshot or a live store, and drops DecisionModel from R.
  it('Should_AcceptASnapshotOrALiveStore_When_ThePolicyIsReplayed', () => {
    expect(matcher.replay).type.toBeCallableWith('change', observations.snapshot())
    expect(matcher.replay).type.toBeCallableWith('change', observations)
  })

  it('Should_DropDecisionModelFromR_When_ThePolicyIsReplayed', () => {
    expect(matcher.replay('change', observations)).type.toBe<
      Effect.Effect<string | number | boolean, AiError.AiError | Discern.UncertainMatchError, never>
    >()
  })
})

describe('the procedure registry', () => {
  it('Should_AcceptHomogeneousMembers_When_TheRegistryIsBuilt', () => {
    expect(Procedure.registry).type.toBeCallableWith(Request, [findCap, reviewCap])
  })

  it('Should_RejectAHeterogeneousMember_When_TheInputDiffers', () => {
    // `numeric` does not accept the registry's input type
    expect(Procedure.registry).type.toBeCallableWith(Request, [findCap, reviewCap])
    expect(Procedure.registry).type.not.toBeCallableWith(Request, [findCap, numeric])
  })

  it('Should_KeepIdsLiteral_When_AGetIsCheckedAgainstMembership', () => {
    // Ids stay literal, so `get` is checked against actual membership.
    expect(code.get).type.toBeCallableWith('find')
    expect(code.get).type.not.toBeCallableWith('test-gaps')
    expect(code.get('find')).type.toBe<typeof findCap>()
  })

  it('Should_UnionTheMemberOutputs_When_Invoked', () => {
    // invoke unions the member outputs.
    expect(code.invoke).type.toBeCallableWith('x')
    expect(code.invoke('x')).type.toBe<
      Effect.Effect<
        number | 'reviewed',
        | AiError.AiError
        | Procedure.NoEligibleProcedureError
        | Procedure.DepthExceededError
        | Procedure.RoutingUncertainError,
        DecisionModel.DecisionModel
      >
    >()
  })

  it('Should_WidenTheSuccessType_When_AFallbackIsGiven', () => {
    // A fallback widens the success type rather than being swallowed.
    expect(code.invoke).type.toBeCallableWith('x', { onUncertain: () => 'escalated' as const })
    expect(code.invoke('x', { onUncertain: () => 'escalated' as const })).type.toBe<
      Effect.Effect<
        number | 'reviewed' | 'escalated',
        AiError.AiError | Procedure.NoEligibleProcedureError | Procedure.DepthExceededError,
        DecisionModel.DecisionModel
      >
    >()
  })

  it('Should_CarryTheFullRanking_When_Routing', () => {
    // Routing carries the full ranking, keyed by the registry's own ids. `None`
    // has no ranking, because eligibility ruled everything out before any model
    // was asked — so it has to be narrowed separately.
    expect(code.route).type.toBeCallableWith('x')
    expect(
      code.route('x').pipe(
        Effect.map((route) => {
          expect(route).type.toBe<Procedure.Route<'find' | 'review'>>()
          switch (route._tag) {
            case 'Matched':
              return `${route.id} by ${route.by}`
            case 'Uncertain':
              return route.ranked[0]!.id
            case 'None':
              return route.reason
          }
        }),
      ),
    ).type.toBe<Effect.Effect<string, AiError.AiError, DecisionModel.DecisionModel>>()
  })
})

describe('the projected registry', () => {
  it('Should_TypeTheDecisionByTheProjection_When_RouteBySelectsPartOfTheInput', () => {
    // The routing decision is typed by the projection, not the full input.
    expect(envelopes.decision).type.toBe<
      Discern.ClassifyDecision<string, 'read' | 'count', typeof Schema.String>
    >()
  })

  it('Should_SurfaceTheSelectionNextToTheResult_When_InvokedWithRoute', () => {
    // invokeWithRoute surfaces the selection next to the result.
    expect(envelopes.invokeWithRoute).type.toBeCallableWith({ ask: 'read it', payload: 'x' })
    expect(
      envelopes.invokeWithRoute({ ask: 'read it', payload: 'x' }).pipe(
        Effect.map(({ route, value }) => {
          expect(route).type.toBe<Procedure.Route<'read' | 'count'>>()
          return route._tag === 'Matched' ? `${route.id}:${String(value)}` : '?'
        }),
      ),
    ).type.toBe<
      Effect.Effect<
        string,
        | AiError.AiError
        | Procedure.NoEligibleProcedureError
        | Procedure.DepthExceededError
        | Procedure.RoutingUncertainError,
        DecisionModel.DecisionModel
      >
    >()
  })
})

describe('the budget the model hands out', () => {
  it('Should_AcceptBudgetLimits_When_TheModelMakesTheCounter', () => {
    expect(Discern.Model.budget).type.toBeCallableWith({ decisions: 1 })
  })

  it('Should_RejectAHandRolledBudget_When_TheBrandIsPrivate', () => {
    // A Budget carries a private brand, so only `Discern.Model.budget` can make one.
    expect({
      limits: { decisions: 1 },
      spent: () => ({ decisions: 0, calls: 0 }),
      reset: () => {},
    }).type.not.toBeAssignableTo<Discern.Model.Budget>()
  })
})
