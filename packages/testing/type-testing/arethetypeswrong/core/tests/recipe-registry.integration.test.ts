import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { ProblemKindSchema, recipes } from '../src/index.js'

const Feature = makeFeature({ it, layer })

Feature('The recipe registry covers every problem kind').body(({ scenario }) => {
  scenario(
    'every problem kind has a named recipe',
    Effect.sync(() => {
      const missing = ProblemKindSchema.literals.filter((kind) => !(kind in recipes))
      expect(missing).toEqual([])
      const expected = new Set([
        ...ProblemKindSchema.literals,
        'TypesCompanion',
        'TypesCompanionTypes',
        'MultiEntrypoint',
        'KnownBad',
      ])
      const unexpected = Object.keys(recipes).filter((key) => !expected.has(key))
      expect(unexpected).toEqual([])
    }),
  )
})
