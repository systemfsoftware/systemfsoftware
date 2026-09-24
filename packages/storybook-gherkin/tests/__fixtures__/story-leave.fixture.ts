import { Conformance } from '@systemfsoftware/conformance-spec'
import { capture, feature, Given, Then, When } from '@systemfsoftware/storybook-gherkin'
import type { PlayContext, StepFn } from '@systemfsoftware/storybook-gherkin'
import { Data, Effect, Match } from 'effect'
import type * as Scope from 'effect/Scope'
import { screen, userEvent } from 'storybook/test'
import { aliceGreeting } from './greeting-story.model.js'

/**
 * One visit to one story, staged for a single play: every promise the play
 * handed Storybook's step function, and the signal Storybook aborts when the
 * visit moves on.
 */
export interface StagedVisit {
  readonly handedToStorybook: Array<Promise<void>>
  readonly movingOn: AbortController
}

export const freshVisit = (): StagedVisit => ({ handedToStorybook: [], movingOn: new AbortController() })

const greetingStory = () =>
  feature({}, {}).scenario(
    'Alice receives a greeting that names her',
    { with: { user: aliceGreeting.user, greeting: aliceGreeting.greeting } },
    Given`the user ${capture('user')} has an account`(() => undefined),
    When`the system greets ${capture('user')}`(() => undefined),
    Then`the greeting mentions ${capture('user')} and reads "${capture('greeting')}"`(() => undefined),
  )

/**
 * Storybook's step function as the browser runner calls it: it calls the
 * promise the play hands it and awaits that promise. Every promise it is
 * handed is recorded, so the check can wait on exactly those promises.
 */
const recordingStep = (staged: StagedVisit): StepFn => (_label, promised) => {
  const handed = Promise.resolve(promised())
  staged.handedToStorybook.push(handed)
  return handed
}

/**
 * The context Storybook supplies to a play. The canvas, the user-event helper
 * and the session data are Storybook's own; the element is a real one from the
 * conformance project's DOM environment, which is the only member the lane
 * cannot take from Storybook itself.
 */
const playContextFor = (staged: StagedVisit): PlayContext => ({
  canvas: screen,
  canvasElement: document.createElement('div'),
  step: recordingStep(staged),
  userEvent: userEvent.setup(),
  args: {},
  globals: {},
  parameters: {},
  loaded: {},
  abortSignal: staged.movingOn.signal,
  reporting: { reports: [], addReport: () => undefined },
})

/**
 * One play of the story, played once. The play runs with the visit's signal,
 * and closing the scope aborts that signal — the path Storybook's teardown
 * takes to the play.
 */
export const playedOnce = (staged: StagedVisit): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => staged.movingOn),
    (movingOn) => Effect.sync(() => movingOn.abort()),
  ).pipe(Effect.andThen(Effect.promise(() => greetingStory().play(playContextFor(staged)))))

/**
 * Every promise the play handed Storybook's step function, once every one of
 * them has settled. This waits on the promises themselves: nothing here counts
 * steps or sleeps, so a promise that never settles leaves the check waiting on
 * it with nothing else able to run.
 */
export const everyStepSettled = (staged: StagedVisit): Effect.Effect<void> =>
  Effect.asVoid(Effect.promise(() => Promise.allSettled(staged.handedToStorybook)))

export class CheckRejected
  extends Data.TaggedError('@systemfsoftware/storybook-gherkin/tests/__fixtures__/story-leave.fixture/CheckRejected')<{
    readonly report: string
  }>
{}

/** The check's own bound, and the only way past a report that did not pass. */
export const passOf = (report: Conformance.Report<never, never>): Conformance.Pass =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed),
    Match.orElse(() => {
      throw new CheckRejected({ report: Conformance.render(report) })
    }),
  )
