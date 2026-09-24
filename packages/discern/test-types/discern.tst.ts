import { Discern } from '@systemfsoftware/discern'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import type * as Layer from 'effect/Layer'
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
  it('Should_AcceptABandThreshold_When_ProbabilityMissBelowIsGiven', () => {
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

  it('Should_TraceTheSameRun_When_TheStandaloneRunWithTraceIsUsedInEitherDirection', () => {
    expect(Discern.runWithTrace(matcher, 'change')).type.toBe<
      Discern.PolicyTraced<string | number | boolean, never, never, typeof Schema.String>
    >()
    expect(pipe(matcher, Discern.runWithTrace('change'))).type.toBe<
      Discern.PolicyTraced<string | number | boolean, never, never, typeof Schema.String>
    >()
  })

  it('Should_RejectAnInputOfAnotherType_When_TheStandaloneRunWithTraceIsCalled', () => {
    expect(Discern.runWithTrace).type.toBeCallableWith(matcher, 'change')
    expect(Discern.runWithTrace).type.not.toBeCallableWith(matcher, 42)
  })
})

describe('the exhaustive classification match', () => {
  it('Should_AcceptTheFinishedClassification_When_EveryLabelIsHandled', () => {
    expect(Discern.exhaustive).type.toBeCallableWith(matchedAll)
  })

  it('Should_RejectAnIncompleteClassification_When_LabelIsMissing', () => {
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
      Effect.Effect<
        string,
        | AiError.AiError
        | Discern.DecisionIdCollisionError
        | Discern.InvalidThresholdError
        | Discern.PolicyCommandRejected
        | Discern.UncertainMatchError,
        DecisionModel.DecisionModel
      >
    >()
  })
})

describe('the questions ask and match accept', () => {
  it('Should_AcceptASchemaScopedNode_When_QuestionIsAsked', () => {
    expect(Discern.ask).type.toBeCallableWith(scopedProbability, 'change')
  })

  it('Should_RejectAnUnscopedNode_When_QuestionIsAsked', () => {
    expect(Discern.ask).type.not.toBeCallableWith(unscopedProbability, 'change')
  })

  it('Should_AcceptASchemaScopedNode_When_MatchIsStarted', () => {
    expect(Discern.match).type.toBeCallableWith(scopedImpact)
  })

  it('Should_RejectAnUnscopedNode_When_MatchIsStarted', () => {
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
  it('Should_InferTheHandlerInput_When_WhenHandlerIsWrittenWithoutAnnotation', () => {
    expect(matcher).type.toBe<
      Discern.Policy<string, string | number | boolean, never, never, typeof Schema.String>
    >()
  })

  it('Should_InferTheCaseHandlerInput_When_CaseHandlerIsWrittenWithoutAnnotation', () => {
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

  it('Should_AcceptALiveStore_When_ReplayLayerIsBuilt', () => {
    expect(Discern.Model.replayLayer).type.toBeCallableWith(observations)
  })

  it('Should_RejectAnUnawaitedSnapshot_When_ReplayLayerIsBuilt', () => {
    expect(Discern.Model.replayLayer).type.not.toBeCallableWith(Discern.Model.snapshot(observations))
  })

  it('Should_DropDecisionModelFromR_When_PolicyRunsOnAReplayLayer', () => {
    expect(Effect.provide(matcher('change'), Discern.Model.replayLayer(observations))).type.toBe<
      Effect.Effect<
        string | number | boolean,
        | AiError.AiError
        | Discern.DecisionIdCollisionError
        | Discern.InvalidThresholdError
        | Discern.PolicyCommandRejected
        | Discern.UncertainMatchError,
        never
      >
    >()
  })
})

describe('the dual counterpart every decision kind exposes', () => {
  it('Should_BuildTheSamePattern_When_ClassifyDualIsUsedInEitherDirection', () => {
    expect(impact.pipe(Discern.is('breaking'))).type.toBe<Discern.Pattern<string>>()
    expect(Discern.is(impact, 'breaking', { match: 0.8 })).type.toBe<Discern.Pattern<string>>()
  })

  it('Should_RejectAnUnknownLabel_When_TheClassifyDualIsCalled', () => {
    expect(Discern.is).type.not.toBeCallableWith(impact, 'critical')
  })

  it('Should_BuildTheSamePattern_When_ProbabilityDualIsUsedInEitherDirection', () => {
    expect(risky.pipe(Discern.above(0.8))).type.toBe<Discern.Pattern<string>>()
    expect(Discern.above(risky, 0.8, { missBelow: 0.5 })).type.toBe<Discern.Pattern<string>>()
  })

  it('Should_RejectAWordThreshold_When_TheProbabilityDualIsCalled', () => {
    expect(Discern.above).type.not.toBeCallableWith(risky, 'high')
  })

  it('Should_BuildTheSamePattern_When_RateDualIsUsedInEitherDirection', () => {
    expect(severe.pipe(Discern.atLeast('medium'))).type.toBe<Discern.Pattern<string>>()
    expect(Discern.atLeast(severe, 'medium')).type.toBe<Discern.Pattern<string>>()
  })

  it('Should_RejectAnUnknownLevel_When_TheRateDualIsCalled', () => {
    expect(Discern.atLeast).type.not.toBeCallableWith(severe, 'critical')
  })

  it('Should_InterpretANode_When_WhereAndWhereResultAreUsed', () => {
    expect(Discern.where(scopedImpact, (answer) => answer.label === 'none')).type.toBe<Discern.Pattern<string>>()
    expect(scopedImpact.pipe(Discern.whereResult(() => Discern.matched()))).type.toBe<Discern.Pattern<string>>()
  })

  it('Should_ReadAPattern_When_EvaluateAndPreviewAreCalled', () => {
    const question = Discern.and(impact.is('breaking'), risky.above(0.8))
    expect(Discern.preview(question, 'change')).type.toBe<Discern.Preview>()
    expect(Discern.evaluate(question, 'change', {})).type.toBe<Discern.PatternResult>()
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

const nakedModel = Discern.Model.model(Discern.Model.unavailable)
const figuredModel = Discern.Model.model(Discern.Model.unavailable).pipe(
  Discern.Model.Model.operations.recording(observations),
  Discern.Model.Model.operations.caching(observations),
  Discern.Model.Model.operations.replaying(observations),
  Discern.Model.Model.operations.budgeted(spend),
)

describe('the model builder', () => {
  it('Should_KeepTheModelResource_When_CombinatorsAreApplied', () => {
    expect(figuredModel).type.toBe<Discern.Model.Model>()
    expect(
      Discern.Model.model(Discern.Model.unavailable).recording(observations).caching(observations),
    ).type.toBe<Discern.Model.Model>()
  })

  it('Should_CombineTheInterceptorStacks_When_MethodsAndDualsAreMixed', () => {
    expect(nakedModel.pipe(Discern.Model.Model.operations.recording(observations))).type.toBe<
      Discern.Model.Model
    >()
    expect(Discern.Model.Model.operations.recording(nakedModel, observations)).type.toBe<Discern.Model.Model>()
    expect(Discern.Model.Model.operations.budgeted).type.toBeCallableWith(spend)
    expect(Discern.Model.Model.operations.budgeted).type.not.toBeCallableWith(observations)
  })

  it('Should_CompileTheBuilderAgainstTheDual_When_TheLayerProjectionIsRead', () => {
    expect(
      Discern.Model.model(Discern.Model.unavailable).recording(observations).budgeted(spend).layer,
    ).type.toBe<Layer.Layer<DecisionModel.DecisionModel, never, never>>()
    expect(
      Discern.Model.layer(Discern.Model.unavailable, [Discern.Model.recording(observations)]),
    ).type.toBe<Layer.Layer<DecisionModel.DecisionModel, never, never>>()
  })
})

describe('the three forms of a blueprint operation', () => {
  it('Should_AgreeAcrossMethodAndBothDuals_When_CaseIsAdded', () => {
    const base = Discern.type(Schema.String)
    const byMethod = base.when(impact.is('breaking'), (input) => input.length)
    const byDual = Discern.when(base, impact.is('breaking'), (input) => input.length)
    const byPipe = base.pipe(Discern.when(impact.is('breaking'), (input) => input.length))
    expect(byMethod).type.toBe<Discern.Matcher<string, typeof Schema.String, number>>()
    expect(byDual).type.toBe<Discern.Matcher<string, typeof Schema.String, number>>()
    expect(byPipe).type.toBe<Discern.Matcher<string, typeof Schema.String, number>>()
  })

  it('Should_ShrinkTheRemainingLabels_When_CaseIsAddedInAnyForm', () => {
    const start = Discern.match(impact)
    const byMethod = start.caseOf('none', (input) => input.length)
    const byDual = Discern.case(start, 'none', (input) => input.length)
    const byPipe = start.pipe(Discern.case('none', (input) => input.length))
    type Shrunk = Discern.ClassificationMatcher<
      string,
      typeof Schema.String,
      'none' | 'additive' | 'behavioral' | 'breaking',
      'additive' | 'behavioral' | 'breaking',
      number
    >
    expect(byMethod).type.toBe<Shrunk>()
    expect(byDual).type.toBe<Shrunk>()
    expect(byPipe).type.toBe<Shrunk>()
  })

  it('Should_RefuseAHandledLabel_When_ItIsAddedAgain', () => {
    const handled = Discern.match(impact).caseOf('none', () => 0)
    expect(handled.caseOf).type.toBeCallableWith('breaking', () => 1)
    expect(handled.caseOf).type.not.toBeCallableWith('none', () => 1)
  })

  it('Should_AgreeAcrossMethodAndBothDuals_When_ProbabilityIsRead', () => {
    expect(risky.above(0.8)).type.toBe<Discern.Pattern<string>>()
    expect(Discern.above(risky, 0.8)).type.toBe<Discern.Pattern<string>>()
    expect(pipe(risky, Discern.above(0.8))).type.toBe<Discern.Pattern<string>>()
  })
})
