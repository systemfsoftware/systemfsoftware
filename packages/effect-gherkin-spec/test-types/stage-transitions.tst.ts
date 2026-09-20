import { Gherkin, Given, StageTypeId, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type {
  GherkinEffect,
  GivenStage,
  InitialStage,
  StepError,
  ThenStage,
} from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { describe, expect, it } from 'tstyche'

declare const acceptConcludedScenario: <A extends object & ThenStage, E, R>(
  name: string,
  pipeline: GherkinEffect<A, E, R>,
) => void

describe('BDD Stage Transitions and Scenario Conformance', () => {
  describe('Stage Progression Laws', () => {
    it('initializes Gherkin.Do with InitialStage', () => {
      expect(Gherkin.Do).type.toBe<GherkinEffect<InitialStage, never, never>>()
    })

    it('transitions from InitialStage to GivenStage upon Given step', () => {
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

    it('infers scope parameters inside Then callbacks correctly', () => {
      const pipeline = Gherkin.Do.pipe(
        Given('user identity')('id', () => Effect.succeed('usr_42')),
        When('profile loaded')('name', () => Effect.succeed('Alice')),
        Then('attributes match')((s) => {
          expect(s.id).type.toBe<string>()
          expect(s.name).type.toBe<string>()
        }),
      )
      void pipeline
    })
  })

  describe('Scenario Acceptance Laws', () => {
    it('accepts concluded pipeline ending on Then step', () => {
      const concluded = Gherkin.Do.pipe(
        Given('setup')('count', () => Effect.succeed(10)),
        When('action')('status', () => Effect.succeed('active')),
        Then('verify')(() => {}),
      )
      expect(acceptConcludedScenario).type.toBeCallableWith('concluded', concluded)
    })

    it('rejects scenario pipeline ending on Given step without Then', () => {
      const givenOnly = Gherkin.Do.pipe(
        Given('setup')('count', () => Effect.succeed(10)),
      )
      const concluded = Gherkin.Do.pipe(
        Given('setup')('count', () => Effect.succeed(10)),
        Then('verify')(() => {}),
      )
      expect(acceptConcludedScenario).type.toBeCallableWith('concluded', concluded)
      expect(acceptConcludedScenario).type.not.toBeCallableWith('given only', givenOnly)
    })

    it('rejects scenario pipeline ending on When step without Then', () => {
      const whenOnly = Gherkin.Do.pipe(
        Given('setup')('count', () => Effect.succeed(10)),
        When('action')('status', () => Effect.succeed('active')),
      )
      const concluded = Gherkin.Do.pipe(
        Given('setup')('count', () => Effect.succeed(10)),
        When('action')('status', () => Effect.succeed('active')),
        Then('verify')(() => {}),
      )
      expect(acceptConcludedScenario).type.toBeCallableWith('concluded', concluded)
      expect(acceptConcludedScenario).type.not.toBeCallableWith('when only', whenOnly)
    })

    it('rejects multi-action scenario pipeline ending on intermediate When without trailing Then', () => {
      const intermediateWhen = Gherkin.Do.pipe(
        Given('setup')('count', () => Effect.succeed(10)),
        When('first action')('status', () => Effect.succeed('active')),
        Then('first check')(() => {}),
        When('second action')('metric', () => Effect.succeed(100)),
      )
      const fullyConcluded = Gherkin.Do.pipe(
        Given('setup')('count', () => Effect.succeed(10)),
        When('first action')('status', () => Effect.succeed('active')),
        Then('first check')(() => {}),
        When('second action')('metric', () => Effect.succeed(100)),
        Then('second check')(() => {}),
      )
      expect(acceptConcludedScenario).type.toBeCallableWith('fully concluded', fullyConcluded)
      expect(acceptConcludedScenario).type.not.toBeCallableWith('intermediate when', intermediateWhen)
    })
  })
})
