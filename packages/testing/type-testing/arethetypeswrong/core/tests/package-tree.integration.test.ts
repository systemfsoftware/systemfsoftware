import { checkPackage, createPackage } from '@systemfsoftware/arethetypeswrong-core'
import { it, layer, makeFeature, StepError } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Package tree constructor — file-tree to Package projection').body(({ scenario }) => {
  scenario(
    'Should_PrefixRelativeFiles_When_AuthoredTreeHasRelativePackageJsonAndDts',
    Effect.gen(function*() {
      const pkg = createPackage(
        {
          'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
          'index.d.ts': 'export declare const x: number',
        },
        'demo',
        '1.0.0',
      )

      expect(pkg.fileExists('/node_modules/demo/package.json')).toBe(true)
      expect(pkg.fileExists('/node_modules/demo/index.d.ts')).toBe(true)

      const result = yield* checkPackage(pkg)
      expect(result).toHaveProperty('entrypoints')
    }).pipe(Effect.mapError((cause) => new StepError({ keyword: 'scenario', text: 'checkPackage failed', cause }))),
  )

  scenario(
    'Should_PrefixScopedName_When_PackageNameIsScoped',
    Effect.gen(function*() {
      const pkg = createPackage(
        {
          'package.json': JSON.stringify({ name: '@acme/pkg', version: '1.0.0' }),
          'index.d.ts': 'export {}',
        },
        '@acme/pkg',
        '1.0.0',
      )

      expect(pkg.fileExists('/node_modules/@acme/pkg/package.json')).toBe(true)
      expect(pkg.fileExists('/node_modules/@acme/pkg/index.d.ts')).toBe(true)

      const result = yield* checkPackage(pkg)
      expect(result).toHaveProperty('entrypoints')
    }).pipe(Effect.mapError((cause) => new StepError({ keyword: 'scenario', text: 'checkPackage failed', cause }))),
  )
})
