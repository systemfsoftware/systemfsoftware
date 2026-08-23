import { Gherkin, Given, it, layer, makeFeature, StepError, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Exit } from 'effect'
import { expect } from 'vitest'
import { checkPackage, ProblemKindSchema, recipes } from '../src/index.js'

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

  for (const kind of ProblemKindSchema.literals) {
    scenario(
      `the analysis of ${kind} reports problem kind ${kind}`,
      Gherkin.Do.pipe(
        Given('the recipe package')('pkg', () => {
          const recipe = recipes[kind as keyof typeof recipes]
          return Effect.sync(() => recipe())
        }),
        When('the package is analysed')('analysis', ({ pkg }) => checkPackage(pkg)),
        Then('the analysis reports the expected problem kind')(({ analysis }) =>
          Effect.sync(() => {
            expect('problems' in analysis).toBe(true)
            if ('problems' in analysis) {
              expect(analysis.problems.some((problem) => problem.kind === kind)).toBe(true)
            }
          })
        ),
      ),
    )
  }

  scenario(
    'TypesCompanion merged with TypesCompanionTypes resolves its companion types',
    Gherkin.Do.pipe(
      Given('the recipe package merged with its companion types')(
        'pkg',
        () => Effect.sync(() => recipes.TypesCompanion().mergedWithTypes(recipes.TypesCompanionTypes())),
      ),
      When('the package is analysed')('analysis', ({ pkg }) => checkPackage(pkg)),
      Then('the analysis resolves the companion types')(({ analysis }) =>
        Effect.sync(() => {
          expect('types' in analysis).toBe(true)
          if (
            'types' in analysis &&
            typeof analysis.types === 'object' &&
            analysis.types !== null &&
            'kind' in analysis.types
          ) {
            expect(analysis.types.kind).toBe('@types')
          }
          if ('problems' in analysis) {
            expect(analysis.problems).toEqual([])
          }
        })
      ),
    ),
  )

  scenario(
    'MultiEntrypoint reports a result per declared entrypoint',
    Gherkin.Do.pipe(
      Given('the multi-entrypoint package')('pkg', () => Effect.sync(() => recipes.MultiEntrypoint())),
      When('the package is analysed')('analysis', ({ pkg }) => checkPackage(pkg)),
      Then('the analysis contains each declared entrypoint')(({ analysis }) =>
        Effect.sync(() => {
          expect('entrypoints' in analysis).toBe(true)
          if ('entrypoints' in analysis) {
            expect(Object.keys(analysis.entrypoints)).toEqual(expect.arrayContaining(['.', './macros', './utils']))
            expect(Object.keys(analysis.entrypoints)).toHaveLength(3)
          }
        })
      ),
    ),
  )

  scenario(
    'KnownBad fails the analysis',
    Gherkin.Do.pipe(
      Given('the known-bad recipe')('pkg', () => Effect.sync(() => recipes.KnownBad())),
      When('the fixture is analysed')('outcome', ({ pkg }) => Effect.exit(checkPackage(pkg))),
      Then('the analysis fails')(({ outcome }) =>
        Effect.sync(() => {
          expect(Exit.isFailure(outcome)).toBe(true)
        })
      ),
    ),
  )
})
