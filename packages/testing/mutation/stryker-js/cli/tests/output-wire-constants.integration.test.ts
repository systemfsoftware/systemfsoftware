import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { STREAM_SCHEMA_VERSION, TICK_INTERVAL_MS } from './__fixtures__/output-subject.js'

const checkExpect = expect

const Feature = makeFeature({ it, layer })

const MAJOR_DOT_MINOR = /^\d+\.\d+$/

Feature('Stream-protocol wire constants').body(({ scenario }) => {
  scenario(
    'The heartbeat tick interval is a positive integer',
    Gherkin.Do.pipe(
      Given('the stream-protocol wire constants')(
        'constants',
        () => Effect.succeed({ tickIntervalMs: TICK_INTERVAL_MS }),
      ),
      Then('the tick interval is schedulable')((s: { constants: { tickIntervalMs: number } }) => {
        checkExpect(Number.isInteger(s.constants.tickIntervalMs)).toBe(true)
        checkExpect(s.constants.tickIntervalMs).toBeGreaterThan(0)
      }),
    ),
  )

  scenario(
    'The stream schema version is major-dot-minor',
    Gherkin.Do.pipe(
      Given('the stream-protocol wire constants')(
        'constants',
        () => Effect.succeed({ schemaVersion: STREAM_SCHEMA_VERSION }),
      ),
      Then('the version carries a major-dot-minor shape')((s: { constants: { schemaVersion: string } }) => {
        checkExpect(MAJOR_DOT_MINOR.test(s.constants.schemaVersion)).toBe(true)
      }),
    ),
  )
})
