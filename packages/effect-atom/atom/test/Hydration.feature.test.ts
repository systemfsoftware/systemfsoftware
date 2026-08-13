import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec-v4'
import * as Effect from 'effect/Effect'
import { expect } from 'vitest'
import * as Hydration from '../src/Hydration.js'
import * as Registry from '../src/Registry.js'

const Feature = makeFeature({ it, layer })

Feature('Hydration entry points for coverage')
  .body(({ scenario }) => {
    scenario(
      'dehydrate on empty registry returns empty',
      Gherkin.Do.pipe(
        Given('a registry')('r', () => Effect.sync(() => Registry.make())),
        When('dehydrate')('state', (s) => Effect.sync(() => Hydration.dehydrate(s.r))),
        Then('length 0')((s) => {
          expect(s.state.length).toBe(0)
        }),
      ),
    )
  })
