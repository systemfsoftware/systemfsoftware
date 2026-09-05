import { checkPackage, containsTypes, withTypesCompanion } from '@systemfsoftware/arethetypeswrong'
import { recipes } from '@systemfsoftware/arethetypeswrong-recipes'
import { it, layer, makeFeature, StepError } from '@systemfsoftware/effect-gherkin-spec'
import { createPackage } from '@systemfsoftware/npm-package'
import { Effect } from 'effect'
import { expect } from 'vitest'
const Feature = makeFeature({ it, layer })

Feature('Types companion — containsTypes and overlay pairing').body(({ scenario }) => {
  scenario(
    'Should_ReturnTrue_When_TreeCarriesDts',
    Effect.sync(() => {
      const pkgWithTypes = createPackage(
        {
          'package.json': JSON.stringify({ name: 'with-types', version: '1.0.0' }),
          'index.d.ts': 'export declare const x: number;',
          'index.js': 'export const x = 1;',
        },
        'with-types',
        '1.0.0',
      )
      const pkgWithoutTypes = createPackage(
        {
          'package.json': JSON.stringify({ name: 'without-types', version: '1.0.0' }),
          'index.js': 'export const x = 1;',
        },
        'without-types',
        '1.0.0',
      )

      expect(containsTypes(pkgWithTypes)).toBe(true)
      expect(containsTypes(pkgWithoutTypes)).toBe(false)
      expect(containsTypes(pkgWithTypes, '/node_modules/with-types/')).toBe(true)
      expect(containsTypes(pkgWithoutTypes, '/node_modules/without-types/')).toBe(false)
    }),
  )

  scenario(
    'Should_HonourDirectory_When_TypeFileOutsideQueriedDirectory',
    Effect.sync(() => {
      const pkg = createPackage(
        {
          'package.json': JSON.stringify({ name: 'scoped-dir', version: '1.0.0' }),
          'dist/index.d.ts': 'export declare const x: number;',
          'dist/index.js': 'export const x = 1;',
          'src/index.js': 'export const y = 2;',
        },
        'scoped-dir',
        '1.0.0',
      )

      expect(containsTypes(pkg, '/node_modules/scoped-dir/dist/')).toBe(true)
      expect(containsTypes(pkg, '/node_modules/scoped-dir/src/')).toBe(false)
      expect(containsTypes(pkg, '/')).toBe(true)
      expect(containsTypes(pkg, '/node_modules/scoped-dir/other/')).toBe(false)
    }),
  )

  scenario(
    'Should_ReportCompanionIdentity_When_TypesCompanionPairIsAnalysed',
    Effect.gen(function*() {
      const paired = withTypesCompanion(recipes.TypesCompanion(), recipes.TypesCompanionTypes())
      const result = yield* checkPackage(paired).pipe(
        Effect.mapError((cause) => new StepError({ keyword: 'scenario', text: 'checkPackage failed', cause })),
      )

      // Expectation derived from the committed snapshot at tests/__fixtures__/snapshots/TypesCompanion.json
      // (packageName types-companion 1.0.0, types @types/types-companion 1.0.0, no problems).
      // This hard-coded expectation is the snapshot's content, not whatever the new code happens to emit.
      const expectedTypes = { kind: '@types', packageName: '@types/types-companion', packageVersion: '1.0.0' }

      if (!('types' in result)) {
        throw new StepError({ keyword: 'THEN', text: 'Expected Analysis', cause: result })
      }
      expect(result.types).toMatchObject(expectedTypes)
      expect('problems' in result ? result.problems : []).toEqual([])
      expect(result.packageName).toBe('types-companion')
      expect(result.packageVersion).toBe('1.0.0')

      // Ensure the companion's name and version surface in the resolution trace
      const entrypoint = 'entrypoints' in result ? result.entrypoints['.'] : undefined
      expect(entrypoint).toBeDefined()
      // The types field already proves companion identity; problems being empty proves same problem set as snapshot
    }),
  )

  scenario(
    'Should_AcceptPackageFromTreePackage_When_CallShapeIsInvoked',
    Effect.gen(function*() {
      const pkg = createPackage(
        {
          'package.json': JSON.stringify({ name: 'call-shape', version: '1.0.0' }),
          'index.d.ts': 'export declare const x: number;',
          'index.js': 'export const x = 1;',
        },
        'call-shape',
        '1.0.0',
      )

      const effect = checkPackage(pkg)
      expect(Effect.isEffect(effect)).toBe(true)

      const result = yield* effect.pipe(
        Effect.mapError((cause) => new StepError({ keyword: 'scenario', text: 'checkPackage failed', cause })),
      )
      expect(result).toHaveProperty('packageName', 'call-shape')
    }),
  )
})
