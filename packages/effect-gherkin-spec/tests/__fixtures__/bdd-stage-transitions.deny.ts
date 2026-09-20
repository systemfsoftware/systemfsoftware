import type { ScenarioFn } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

declare const scenario: ScenarioFn

const validSequence = (): void => {
  scenario(
    'A valid Given When Then sequence compiles cleanly',
    Gherkin.Do.pipe(
      Given('initial setup condition')('x', () => Effect.succeed(1)),
      When('an action occurs')('y', (s) => Effect.succeed(s.x + 1)),
      Then('outcome is verified')((s) => {
        void s.y
      }),
    ),
  )
}

const denyWhenBeforeGiven = (): void => {
  scenario(
    'When step cannot precede Given in pipeline',
    Gherkin.Do.pipe(
      When('action taken first')('x', () => Effect.succeed(1)),
      // @ts-expect-error When cannot be followed by Given
      Given('attempting Given after When')('y', () => Effect.succeed(2)),
      Then('outcome observed')(() => {}),
    ),
  )
}

const denyGivenAfterThen = (): void => {
  scenario(
    'Given step cannot follow Then in pipeline',
    Gherkin.Do.pipe(
      Given('initial state')('x', () => Effect.succeed(1)),
      Then('asserting outcome')(() => {}),
      // @ts-expect-error Given cannot be followed by Then
      Given('attempting setup after assertion')('y', () => Effect.succeed(2)),
      Then('outcome observed')(() => {}),
    ),
  )
}

const denyPipelineEndingOnGiven = (): void => {
  scenario(
    'Pipeline ending on Given without Then is rejected',
    // @ts-expect-error Headless pipeline ending on Given without Then is rejected
    Gherkin.Do.pipe(
      Given('setup without assertion')('x', () => Effect.succeed(1)),
    ),
  )
}

const denyPipelineEndingOnWhen = (): void => {
  scenario(
    'Pipeline ending on When without Then is rejected',
    // @ts-expect-error Headless pipeline ending on When without Then is rejected
    Gherkin.Do.pipe(
      Given('initial state')('x', () => Effect.succeed(1)),
      When('action taken without outcome assertion')('y', () => Effect.succeed(2)),
    ),
  )
}

void validSequence
void denyWhenBeforeGiven
void denyGivenAfterThen
void denyPipelineEndingOnGiven
void denyPipelineEndingOnWhen
