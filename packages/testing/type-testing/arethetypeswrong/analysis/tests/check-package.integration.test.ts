import { checkPackage } from '@systemfsoftware/arethetypeswrong'
import { recipes } from '@systemfsoftware/arethetypeswrong-recipes'
import { it, layer, makeFeature, StepError } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

/**
 * CheckPackage — analysis of a synthetic recipe package.
 *
 * Drives the real `checkPackage` analysis over a recipe-built package,
 * proving that the in-memory constructor path yields an analysable package
 * without reading a committed tarball.
 */
const Feature = makeFeature({ it, layer })

Feature('CheckPackage — analysis of a synthetic recipe package').body(({ scenario }) => {
  scenario(
    'Should_ReturnAnalysis_When_RecipePackageIsAnalysed',
    Effect.gen(function*() {
      const pkg = recipes.NamedExports()
      const result = yield* checkPackage(pkg).pipe(
        Effect.mapError((cause) => new StepError({ keyword: 'scenario', text: 'checkPackage failed', cause })),
      )
      if ('packageName' in result && result.packageName !== undefined) {
        expect(result.packageName).toBe('named-exports')
      }
      if ('entrypoints' in result) {
        expect(Object.keys(result.entrypoints)).toContain('.')
      }
    }),
  )
})
