/// <reference types="node" />
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Exit } from 'effect'
import { expect } from 'vitest'

import { checkPackage, ProblemKindSchema, recipes } from '@systemfsoftware/arethetypeswrong-core'

const Feature = makeFeature({ it, layer })

const kindNames = new Set<string>(ProblemKindSchema.literals)

const kindRecipeEntries = Object.entries(recipes).filter(([key]) => kindNames.has(key))
const companionEntries = Object.entries(recipes).filter(
  ([key]) => !kindNames.has(key) && key !== 'KnownBad' && key !== 'TypesCompanionTypes',
)

Feature('The analysis of a synthetic package reproduces its recorded outcome', { timeout: 60_000 }).body(
  ({ scenario }) => {
    scenario(
      'every problem kind has a named recipe (AE7)',
      Effect.sync(() => {
        const kinds = new Set(kindRecipeEntries.map(([key]) => key))
        const missing = ProblemKindSchema.literals.filter((kind) => !kinds.has(kind))
        expect(missing).toEqual([])
      }),
    )

    for (const [recipeKey, recipeFn] of [...kindRecipeEntries, ...companionEntries]) {
      scenario(
        `the analysis of ${recipeKey} reproduces its recorded snapshot`,
        Gherkin.Do.pipe(
          Given('the recipe package')('pkg', () =>
            Effect.sync(() => {
              const pkg = recipeFn()
              if (recipeKey === 'TypesCompanion') {
                return pkg.mergedWithTypes(recipes.TypesCompanionTypes())
              }
              return pkg
            })),
          When('the package is analysed')('analysis', ({ pkg }) =>
            Effect.gen(function*() {
              return yield* checkPackage(pkg)
            })),
          Then('the recorded snapshot still matches the canonical analysis')(({ analysis }) =>
            Effect.promise(() =>
              expect(JSON.stringify(analysis, null, 2) + '\n').toMatchFileSnapshot(
                `./__fixtures__/snapshots/${recipeKey}.json`,
              )
            )
          ),
          Then('the analysis reports the problem kind the recipe is named for')(({ analysis }) =>
            Effect.sync(() => {
              if (kindNames.has(recipeKey)) {
                expect(
                  'problems' in analysis && analysis.problems.some((problem) => problem.kind === recipeKey),
                ).toBe(true)
              }
            })
          ),
        ),
      )
    }

    scenario(
      'the known-bad recipe is rejected by the analysis',
      Gherkin.Do.pipe(
        Given('the known-bad recipe')('pkg', () => Effect.sync(() => recipes.KnownBad())),
        When('the fixture is analysed')('outcome', ({ pkg }) =>
          Effect.exit(
            Effect.gen(function*() {
              return yield* checkPackage(pkg)
            }),
          )),
        Then('the analysis fails')(({ outcome }) =>
          Effect.sync(() => {
            expect(Exit.isFailure(outcome)).toBe(true)
          })
        ),
      ),
    )
  },
)
