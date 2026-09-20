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
    it('initializes Gherkin.Do with InitialStage', () => {
      expect(Gherkin.Do).type.toBe<GherkinEffect<InitialStage, never, never>>()
    })

    it('transitions from InitialStage to GivenStage upon Given step and pins exact scope', () => {
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

    it('rejects Given step when invoked after When step', () => {
      const givenStep = Given('setup')('count', () => Effect.succeed(10))
      const whenPipeline = Gherkin.Do.pipe(
        When('action')('status', () => Effect.succeed('active')),
      )
      expect(givenStep).type.toBeCallableWith(Gherkin.Do)
      expect(givenStep).type.not.toBeCallableWith(whenPipeline)
    })

    it('rejects Given step when invoked after Then step', () => {
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

    it('accepts When step after Given step and transitions to WhenStage', () => {
      const whenStep = When('action')('status', () => Effect.succeed('active'))
      const givenPipeline = Gherkin.Do.pipe(
        Given('setup')('count', () => Effect.succeed(10)),
      )
      expect(whenStep).type.toBeCallableWith(givenPipeline)
    })

    it('accepts When step after Then step in multi-action scenarios', () => {
      const whenStep = When('subsequent action')('metric', () => Effect.succeed(100))
      const thenPipeline = Gherkin.Do.pipe(
        Given('setup')('count', () => Effect.succeed(10)),
        Then('first check')(() => {}),
      )
      expect(whenStep).type.toBeCallableWith(thenPipeline)
    })

    it('accepts Then step after When step and transitions to ThenStage', () => {
      const thenStep = Then('verify outcome')(() => {})
      const whenPipeline = Gherkin.Do.pipe(
        When('action')('status', () => Effect.succeed('active')),
      )
      expect(thenStep).type.toBeCallableWith(whenPipeline)
    })

    it('pins exact structural identity of accumulated scope inside step callbacks', () => {
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
      it('accepts concluded pipeline ending on Then step', () => {
        const concluded = Gherkin.Do.pipe(
          Given('inventory in stock')('count', () => Effect.succeed(10)),
          When('order placed')('status', () => Effect.succeed('placed')),
          Then('inventory decremented')(() => {}),
        )
        expect(scenario).type.toBeCallableWith('Order placed successfully', concluded)
      })

      it('rejects scenario pipeline ending on Given step without Then', () => {
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

      it('rejects scenario pipeline ending on When step without Then', () => {
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

      it('rejects multi-action scenario pipeline ending on intermediate When without trailing Then', () => {
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

      it('rejects plain object literal', () => {
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
