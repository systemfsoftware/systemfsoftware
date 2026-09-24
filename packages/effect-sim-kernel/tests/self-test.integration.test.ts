import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import {
  firstRaceFinding,
  guardedInOneStep,
  raceFindingsWithoutPreemption,
  raceValueOf,
  wrapperVariants,
} from './__fixtures__/selfTestFixtures.js'

const Feature = makeFeature({ it, layer })

Feature('A race between two workers claiming one shared slot')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'One pause finds both workers holding the slot <protection>',
      wrapperVariants,
      (variant) =>
        Gherkin.Do.pipe(
          Given('two workers each take the shared slot only while it is still empty, <protection>')(
            'finding',
            () => Effect.promise(() => firstRaceFinding(variant.program, 1)),
          ),
          Then('the search reports a schedule where both workers took the slot')((s) => {
            expect(raceValueOf(s.finding)).toEqual([true, true])
          }),
          Then('that schedule spends exactly one pause')((s) => {
            expect(s.finding?.preemptions).toBe(1)
          }),
        ),
    )

    scenario(
      'Without a pause the workers never both take the slot',
      Gherkin.Do.pipe(
        Given('the same pair of workers is searched under every protection, and no pause is allowed')(
          'findings',
          () => Effect.promise(() => raceFindingsWithoutPreemption()),
        ),
        Then('no schedule leaves both workers holding the slot')((s) => {
          expect(s.findings.map(raceValueOf)).toEqual([undefined, undefined, undefined, undefined])
        }),
      ),
    )

    scenario(
      'A guard that checks and changes in one step cannot be raced',
      Gherkin.Do.pipe(
        Given('two workers guarded by a single indivisible step, and one pause is allowed')(
          'finding',
          () => Effect.promise(() => firstRaceFinding(guardedInOneStep, 1)),
        ),
        Then('no schedule leaves both workers holding the slot')((s) => {
          expect(raceValueOf(s.finding)).toBeUndefined()
        }),
      ),
    )
  })
