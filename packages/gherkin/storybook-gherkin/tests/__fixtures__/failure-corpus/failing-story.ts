import { capture, feature, Given, Then, When } from '@systemfsoftware/storybook-gherkin'
import type { PlayContext } from '@systemfsoftware/storybook-gherkin'
import { Effect } from 'effect'
import { screen, userEvent } from 'storybook/test'
import type { CorpusFixture } from './record.js'
import { StepMishap } from './step-mishap.schema.js'

export const defectFile = 'packages/gherkin/storybook-gherkin/tests/__fixtures__/failure-corpus/failing-story.ts'

const STEP = 'Then the greeting mentions {greeting}'

const greetingStory = () =>
  feature({}, {}).scenario(
    'Alice receives a greeting that names her',
    { with: { user: 'alice', greeting: 'Hello, alice' } },
    Given`the user ${capture('user')} has an account`(() => undefined),
    When`the system greets ${capture('user')}`(() => undefined),
    Then`the greeting mentions ${capture('greeting')}`(() => {
      throw new StepMishap({ step: STEP, detail: 'the greeting never arrived' })
    }),
  )

const playContext = (): PlayContext => ({
  canvas: screen,
  canvasElement: document.createElement('div'),
  step: (_label, promised) => promised(),
  userEvent: userEvent.setup(),
  args: {},
  globals: {},
  parameters: {},
  loaded: {},
  abortSignal: new AbortController().signal,
  reporting: { reports: [], addReport: () => undefined },
})

export const failingStory: CorpusFixture<never> = {
  name: 'a story step failure',
  defectFile,
  raisingFile: defectFile,
  program: () => Effect.promise(() => greetingStory().play(playContext())),
}
