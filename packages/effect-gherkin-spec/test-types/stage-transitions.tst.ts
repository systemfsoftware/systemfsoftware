import { Gherkin, Given, StageTypeId, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type {
  FeatureFn,
  GherkinEffect,
  GivenStage,
  InitialStage,
  StepError,
  WhenStage,
} from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { describe, expect, it } from 'tstyche'

declare const Feature: FeatureFn

describe('BDD Stage Transitions and Scenario Conformance', () => {
  describe('Stage Progression and Scope Identity Laws', () => {
    it('Should_InitializeGherkinDoWithInitialStage_When_ThePipelineBegins', () => {
      expect(Gherkin.Do).type.toBe<GherkinEffect<InitialStage, never, never>>()
    })

    it('Should_TransitionToGivenStageAndPinScope_When_TheGivenStepIsApplied', () => {
      const givenStep = Given('initial inventory record')('count', () => Effect.succeed(10))
      expect(givenStep).type.toBeCallableWith(Gherkin.Do)

      const givenPipeline = Gherkin.Do.pipe(givenStep)
      expect(givenPipeline).type.toBe<
        GherkinEffect<
          Omit<InitialStage, typeof StageTypeId> & Record<'count', number> & GivenStage,
          StepError,
          never
        >
      >()
    })

    it('Should_RejectAGivenStep_When_InvokedAfterAWhenStep', () => {
      const givenStep = Given('setup')('count', () => Effect.succeed(10))
      const whenPipeline = Gherkin.Do.pipe(
        When('action')('status', () => Effect.succeed('active')),
      )
      expect(givenStep).type.toBeCallableWith(Gherkin.Do)
      expect(givenStep).type.not.toBeCallableWith(whenPipeline)
    })

    it('Should_RejectAGivenStep_When_InvokedAfterAThenStep', () => {
      const givenStep = Given('setup')('count', () => Effect.succeed(10))
      const thenPipeline = Gherkin.Do.pipe(
        Given('prior setup')('seed', () => Effect.succeed(1)),
        Then('verification')((s) => {
          expect(s.seed).type.toBe<number>()
        }),
      )
      expect(givenStep).type.toBeCallableWith(Gherkin.Do)
      expect(givenStep).type.not.toBeCallableWith(thenPipeline)
    })

    it('Should_AcceptAWhenStepAndTransitionToWhenStage_When_AppliedAfterAGivenStep', () => {
      const whenStep = When('action')('status', () => Effect.succeed('active'))
      const givenPipeline = Gherkin.Do.pipe(
        Given('setup')('count', () => Effect.succeed(10)),
      )
      expect(whenStep).type.toBeCallableWith(givenPipeline)
    })

    it('Should_AcceptAWhenStep_When_AppliedAfterAThenStepInAMultiActionScenario', () => {
      const whenStep = When('subsequent action')('metric', () => Effect.succeed(100))
      const thenPipeline = Gherkin.Do.pipe(
        Given('setup')('count', () => Effect.succeed(10)),
        Then('first check')(() => {}),
      )
      expect(whenStep).type.toBeCallableWith(thenPipeline)
    })

    it('Should_AcceptAThenStepAndTransitionToThenStage_When_AppliedAfterAWhenStep', () => {
      const thenStep = Then('verify outcome')(() => {})
      const whenPipeline = Gherkin.Do.pipe(
        When('action')('status', () => Effect.succeed('active')),
      )
      expect(thenStep).type.toBeCallableWith(whenPipeline)
    })

    it('Should_PinAccumulatedScopeInsideStepCallbacks_When_TheStepsAreChained', () => {
      const pipeline = Gherkin.Do.pipe(
        Given('user identity')('id', () => Effect.succeed('usr_42')),
        When('profile loaded')('name', () => Effect.succeed('Alice')),
        Then('attributes match')((s) => {
          expect(s).type.toBe<
            & Omit<InitialStage, typeof StageTypeId>
            & Record<'id', string>
            & Record<'name', string>
            & WhenStage
          >()
          expect(s.id).type.toBe<string>()
          expect(s.name).type.toBe<string>()
        }),
      )
      void pipeline
    })
  })

  describe('Scenario Acceptance Laws on Real Feature Surface', () => {
    Feature('Order fulfillment verification').body(({ scenario }) => {
      it('Should_AcceptAConcludedPipeline_When_ItEndsOnAThenStep', () => {
        const concluded = Gherkin.Do.pipe(
          Given('inventory in stock')('count', () => Effect.succeed(10)),
          When('order placed')('status', () => Effect.succeed('placed')),
          Then('inventory decremented')(() => {}),
        )
        expect(scenario).type.toBeCallableWith('Order placed successfully', concluded)
      })

      it('Should_RejectAScenarioPipeline_When_ItEndsOnAGivenStepWithoutAThen', () => {
        const givenOnly = Gherkin.Do.pipe(
          Given('inventory in stock')('count', () => Effect.succeed(10)),
        )
        const concluded = Gherkin.Do.pipe(
          Given('inventory in stock')('count', () => Effect.succeed(10)),
          Then('inventory confirmed')(() => {}),
        )
        expect(scenario).type.toBeCallableWith('Order confirmed', concluded)
        expect(scenario).type.not.toBeCallableWith('Incomplete order setup', givenOnly)
      })

      it('Should_RejectAScenarioPipeline_When_ItEndsOnAWhenStepWithoutAThen', () => {
        const whenOnly = Gherkin.Do.pipe(
          Given('inventory in stock')('count', () => Effect.succeed(10)),
          When('order placed')('status', () => Effect.succeed('placed')),
        )
        const concluded = Gherkin.Do.pipe(
          Given('inventory in stock')('count', () => Effect.succeed(10)),
          When('order placed')('status', () => Effect.succeed('placed')),
          Then('order processed')(() => {}),
        )
        expect(scenario).type.toBeCallableWith('Order placed with verification', concluded)
        expect(scenario).type.not.toBeCallableWith('Order placed without check', whenOnly)
      })

      it('Should_RejectAMultiActionScenarioPipeline_When_ItEndsOnAnIntermediateWhen', () => {
        const intermediateWhen = Gherkin.Do.pipe(
          Given('order initialized')('count', () => Effect.succeed(10)),
          When('first payment attempted')('status', () => Effect.succeed('pending')),
          Then('status is pending')(() => {}),
          When('second payment confirmed')('metric', () => Effect.succeed(100)),
        )
        const fullyConcluded = Gherkin.Do.pipe(
          Given('order initialized')('count', () => Effect.succeed(10)),
          When('first payment attempted')('status', () => Effect.succeed('pending')),
          Then('status is pending')(() => {}),
          When('second payment confirmed')('metric', () => Effect.succeed(100)),
          Then('order complete')(() => {}),
        )
        expect(scenario).type.toBeCallableWith('Full multi-action payment flow', fullyConcluded)
        expect(scenario).type.not.toBeCallableWith('Dangling multi-action payment', intermediateWhen)
      })

      it('Should_RejectAPlainObjectLiteral_When_ItIsPassedAsAScenarioPipeline', () => {
        const validConcluded = Gherkin.Do.pipe(
          Then('outcome verified')(() => {}),
        )
        const plainObject = { result: true }
        expect(scenario).type.toBeCallableWith('Valid pipeline', validConcluded)
        expect(scenario).type.not.toBeCallableWith('Plain object literal', plainObject)
      })
    })
  })
})
