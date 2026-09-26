import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Match, Option, Schema } from 'effect'

import { feature } from '@systemfsoftware/storybook-gherkin'

import { everyStepSettled, freshVisit, playedOnce, type StagedVisit } from './__fixtures__/story-leave.fixture.js'

const Feature = makeFeature({ it })

interface Staged {
  readonly visits: StagedVisit[]
}

const freshStaged = (): Staged => ({ visits: [] })

const stage = (staged: Staged): StagedVisit => {
  const visit = freshVisit()
  staged.visits.push(visit)
  return visit
}

const noStepLeftWaiting = (visit: StagedVisit): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.flatMap(
    Effect.timeoutOption(everyStepSettled(visit), Duration.seconds(5)),
    (settled) =>
      Option.isSome(settled)
        ? Effect.void
        : Effect.fail(
          new Conformance.RuleBroken({ message: 'a story step was left waiting after the visit moved on' }),
        ),
  )

const restarted = (visit: StagedVisit) => Effect.andThen(visit.processRestarted, playedOnce(visit))

const cutsSearched = (report: Conformance.Report<never, never>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.stopCuts ?? 0),
    Match.orElse(() => 0),
  )

Feature('Leaving a story with nothing hanging when the visit moves on', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A story the visit walks away from mid-step leaves no step waiting for it',
      Gherkin.Do.pipe(
        Given('a place to record each visit the check stages')('staged', () => Effect.sync(freshStaged)),
        When('the visit moves on at every step of the story')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: feature,
              world: Effect.sync(() => stage(s.staged)),
              program: (visit) => playedOnce(visit),
              restart: restarted,
              rule: noStepLeftWaiting,
              stopWithin: Duration.zero,
            }),
        ),
        Then('no story step is left waiting, and at least one step was handed to Storybook')((s, expect) =>
          expect({
            report: s.checked,
            rendered: Conformance.render(s.checked),
            cuts: cutsSearched(s.checked),
            handed: s.staged.visits.reduce((total, visit) => total + visit.handedToStorybook.length, 0),
          }).toMatchObject({
            report: { _tag: 'Pass' },
            cuts: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
            handed: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )
  })
