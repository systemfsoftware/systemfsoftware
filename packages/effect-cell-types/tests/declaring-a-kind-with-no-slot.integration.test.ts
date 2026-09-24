import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { Handle } from '@systemfsoftware/effect-cell-types'

const Feature = makeFeature({ it })

const PlainRecordTypeId = Symbol.for('~systemfsoftware/effect-cell-types/tests/PlainRecord')
const PlainRecord = Handle.make<{ readonly tag: string }>()(PlainRecordTypeId)

Feature('Declaring a kind that carries no slot')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A kind that declares no slot mints its record without a slot mark',
      Gherkin.Do.pipe(
        Given('a plain record for the tag "alpha"')(
          'plain',
          () => Effect.succeed(PlainRecord.make({ tag: 'alpha' })),
        ),
        When('its own symbols are listed')('symbols', (s) => Effect.succeed(Object.getOwnPropertySymbols(s.plain))),
        Then('the record carries nothing but its kind brand')((s) => {
          expect(s.symbols).toEqual([PlainRecordTypeId])
        }),
      ),
    )
  })
