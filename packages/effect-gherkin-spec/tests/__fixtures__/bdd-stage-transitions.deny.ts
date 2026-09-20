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

const denyThenBeforeWhen = (): void => {
  scenario(
    'Then step cannot be followed by When in pipeline',
    Gherkin.Do.pipe(
      Given('initial state')('x', () => Effect.succeed(1)),
      Then('asserting outcome')(() => {}),
      // @ts-expect-error Then cannot be followed by When
      When('attempting action after assertion')('y', () => Effect.succeed(2)),
    ),
  )
}

const denyHeadlessPipeline = (): void => {
  scenario(
    'Pipeline ending on Given without Then is rejected',
    // @ts-expect-error Headless pipeline ending on Given without Then is rejected
    Gherkin.Do.pipe(
      Given('setup without assertion')('x', () => Effect.succeed(1)),
    ),
  )
}

void validSequence
void denyWhenBeforeGiven
void denyThenBeforeWhen
void denyHeadlessPipeline
