import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { Effect, Layer } from 'effect'
import { firstRaceFinding, guardedInOneStep, raceValueOf, wrapperVariants } from './__fixtures__/selfTestFixtures.js'
import type { RaceFinding, WrapperVariant } from './__fixtures__/selfTestFixtures.js'

const Feature = makeFeature({ it })

const searchWithoutPause = (
  programs: ReadonlyArray<WrapperVariant['program']>,
): Promise<ReadonlyArray<RaceFinding>> =>
  programs.reduce<Promise<ReadonlyArray<RaceFinding>>>(
    (pending, program) =>
      pending.then((findings) => firstRaceFinding(0)(program).then((finding) => [...findings, finding])),
    Promise.resolve([]),
  )

Feature('Two workers claiming one shared slot')
  .live('drives its own simulation-kernel run')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'One pause between the workers leaves both holding the slot <protection>',
      wrapperVariants,
      (variant) =>
        Gherkin.Do.pipe(
          Given('two workers that take the shared slot only while it is still empty, <protection>')(
            'contestants',
            () => Effect.succeed(variant.program),
          ),
          When('the two workers run with one pause between them')(
            'finding',
            (s) => Effect.promise(() => firstRaceFinding(1)(s.contestants)),
          ),
          Then('both workers hold the slot')((s) => {
            expect(raceValueOf(s.finding)).toEqual([true, true])
          }),
          And('the schedule spends exactly one pause')((s) => {
            expect(s.finding?.preemptions).toBe(1)
          }),
        ),
    )

    scenario(
      'Without a pause neither worker takes a slot the other also takes',
      Gherkin.Do.pipe(
        Given('the same two workers under every protection')(
          'contestants',
          () => Effect.succeed(wrapperVariants.map((variant) => variant.program)),
        ),
        When('every pair runs with no pause allowed')(
          'findings',
          (s) => Effect.promise(() => searchWithoutPause(s.contestants)),
        ),
        Then('no schedule leaves both workers holding the slot')((s) => {
          expect(s.findings.map(raceValueOf)).toEqual([undefined, undefined, undefined, undefined])
        }),
      ),
    )

    scenario(
      'A guard that checks and changes in one step cannot be raced',
      Gherkin.Do.pipe(
        Given('two workers guarded by a single indivisible step')(
          'contestants',
          () => Effect.succeed(guardedInOneStep),
        ),
        When('the two workers run with one pause between them')(
          'finding',
          (s) => Effect.promise(() => firstRaceFinding(1)(s.contestants)),
        ),
        Then('no schedule leaves both workers holding the slot')((s) => {
          expect(raceValueOf(s.finding)).toBeUndefined()
        }),
      ),
    )
  })
