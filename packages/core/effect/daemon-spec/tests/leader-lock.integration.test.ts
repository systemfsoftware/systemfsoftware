import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { isModeNone } from './__fixtures__/IsModeNone.js'

const Feature = makeFeature({ it, layer })

Feature('LeaderLock mode predicate')
  .body(({ scenario }) => {
    scenario(
      'None mode admits, other modes refuse',
      Gherkin.Do.pipe(
        Given('a none-mode lock and a set of other-mode locks')('locks', () =>
          Effect.succeed({
            none: { mode: 'none' as const },
            others: [{ mode: 'required' }, { mode: 'optional' }, { mode: '' }, { mode: 'None' }],
          })),
        When('the mode predicate is evaluated over every lock')('verdicts', (s) =>
          Effect.succeed({
            none: isModeNone(s.locks.none),
            others: s.locks.others.map((lock) => isModeNone(lock)),
          })),
        Then('only the none lock is admitted')((s) =>
          Effect.sync(() => {
            expect(s.verdicts.none).toBe(true)
            expect(s.verdicts.others.every((admitted) => admitted === false)).toBe(true)
          })
        ),
      ),
    )
  })
