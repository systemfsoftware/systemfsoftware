import { Discern } from '@systemfsoftware/discern'
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
    (input) => {
      expect(input).type.toBe<string>()
      return input.toUpperCase()
    },
  ),
  Discern.when(severe.atLeast('medium'), (input) => {
    expect(input).type.toBe<string>()
    return Effect.succeed(input.length)
  }),
  Discern.onUncertain((input, context) => {
    expect(input).type.toBe<string>()
    expect(context).type.toBe<Discern.UncertainContext>()
    return `review:${context.caseId}:${input}`
  }),
  Discern.orElse((input) => {
    expect(input).type.toBe<string>()
    return input.length > 0
  }),
)

const matchedAll = Discern.match(impact).pipe(
  Discern.case('none', (input) => {
    expect(input).type.toBe<string>()
    return 0
  }),
  Discern.case('additive', (input) => {
    expect(input).type.toBe<string>()
    return 1
  }),
  Discern.case('behavioral', (input) => {
    expect(input).type.toBe<string>()
    return 2
  }),
  Discern.case('breaking', (input) => {
    expect(input).type.toBe<string>()
    return 3
  }),
)

const incomplete = Discern.match(impact).pipe(
  Discern.case('none', (input) => {
    expect(input).type.toBe<string>()
    return 0
  }),
  Discern.case('additive', (input) => {
    expect(input).type.toBe<string>()
    return 1
  }),
)

const exhaustive = matchedAll.pipe(Discern.exhaustive)

const immediate = Discern.value(Schema.String, 'change').pipe(
  Discern.when(impact.is('breaking'), (input) => {
    expect(input).type.toBe<string>()
    return input.toUpperCase()
  }),
  Discern.orElse((input) => {
    expect(input).type.toBe<string>()
    return input
  }),
)

const observations = Discern.Model.store()
const spend = Discern.Model.budget({ decisions: 20, calls: 4 })

const scopedProbability = Change.probability({ id: 'risk', instructions: 'Scoped' })
const scopedImpact = Change.classify({
  id: 'scoped-impact',
  instructions: 'Scoped',
  criteria: { none: 'none', some: 'some' },
})
const unscopedProbability = Discern.probability({ id: 'risk', instructions: 'Unscoped' })
const unscopedImpact = Discern.classify({
  id: 'impact',
  instructions: 'Unscoped',
  criteria: { none: 'none', some: 'some' },
})

describe('the labels a classification accepts', () => {
  it('Should_AcceptAKnownLabel_When_NoThresholdsAreGiven', () => {
    expect(impact.is).type.toBeCallableWith('breaking')
  })

  it('Should_AcceptAKnownLabel_When_ThresholdsAreGiven', () => {
    expect(impact.is).type.toBeCallableWith('breaking', { match: 0.8, miss: 0.2, margin: 0.1 })
  })

  it('Should_RejectAnUnknownLabel_When_ItIsNotInTheCriteria', () => {
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

describe('the questions ask and match accept', () => {
  it('Should_AcceptASchemaScopedNode_When_AQuestionIsAsked', () => {
    expect(Discern.ask).type.toBeCallableWith(scopedProbability, 'change')
  })

  it('Should_RejectAnUnscopedNode_When_AQuestionIsAsked', () => {
    expect(Discern.ask).type.not.toBeCallableWith(unscopedProbability, 'change')
  })

  it('Should_AcceptASchemaScopedNode_When_AMatchIsStarted', () => {
    expect(Discern.match).type.toBeCallableWith(scopedImpact)
  })

  it('Should_RejectAnUnscopedNode_When_AMatchIsStarted', () => {
    expect(Discern.match).type.not.toBeCallableWith(unscopedImpact)
  })
})

describe('the values a calibration sweeps', () => {
  it('Should_AcceptTheCandidates_When_TheValueListHasOne', () => {
    expect(Discern.Eval.calibrate).type.toBeCallableWith({
      schema: Schema.String,
      values: [0.5],
      pattern: (threshold: number) => {
        expect(threshold).type.toBe<number>()
        return scopedProbability.atLeast(threshold)
      },
      examples: [{ input: 'change', expected: true }],
    })
  })

  it('Should_RejectTheCandidates_When_TheValueListIsEmpty', () => {
    expect(Discern.Eval.calibrate).type.not.toBeCallableWith({
      schema: Schema.String,
      values: [],
      pattern: (threshold: number) => scopedProbability.atLeast(threshold),
      examples: [{ input: 'change', expected: true }],
    })
  })
})

describe('the input every handler infers', () => {
  it('Should_InferTheHandlerInput_When_AWhenHandlerIsWrittenWithoutAnnotation', () => {
    expect(matcher).type.toBe<
      Discern.Policy<string, string | number | boolean, never, never, typeof Schema.String>
    >()
  })

  it('Should_InferTheCaseHandlerInput_When_ACaHandlerIsWrittenWithoutAnnotation', () => {
    expect(exhaustive).type.toBe<
      Discern.Policy<string, number, Discern.ExhaustiveMatchError, never, typeof Schema.String>
    >()
  })

  it('Should_InferTheUncertainHandlerInput_When_AnUncertainHandlerIsWrittenWithoutAnnotation', () => {
    expect(matcher).type.toBeCallableWith('change')
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

  it('Should_DropDecisionModelFromR_When_APolicyRunsOnAReplayLayer', () => {
    expect(Effect.provide(matcher('change'), Discern.Model.replayLayer(observations))).type.toBe<
      Effect.Effect<string | number | boolean, AiError.AiError | Discern.UncertainMatchError, never>
    >()
  })
})

describe('the budget the model hands out', () => {
  it('Should_AcceptBudgetLimits_When_TheModelMakesTheCounter', () => {
    expect(Discern.Model.budget).type.toBeCallableWith({ decisions: 1 })
  })

  it('Should_RejectAHandRolledBudget_When_TheBrandIsPrivate', () => {
    expect({
      limits: { decisions: 1 },
      spent: () => ({ decisions: 0, calls: 0 }),
      reset: () => {},
    }).type.not.toBeAssignableTo<Discern.Model.Budget>()
  })
})
