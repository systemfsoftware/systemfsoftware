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
    'Should_KeepAbsoluteInsidePrefix_When_AbsolutePathAlreadyUsesPrefix',
    Effect.sync(() => {
      const pkg = createPackage(
        {
          'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
          '/node_modules/demo/index.d.ts': 'export declare const x: number',
        },
        'demo',
        '1.0.0',
      )

      expect(pkg.fileExists('/node_modules/demo/index.d.ts')).toBe(true)
      expect(pkg.readFile('/node_modules/demo/index.d.ts')).toBe('export declare const x: number')
    }),
  )

  scenario(
    'Should_RefuseAbsoluteOutsidePrefix_When_AbsolutePathIsOutsidePackagePrefix',
    Effect.sync(() => {
      expect(() =>
        createPackage(
          {
            'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
            '/node_modules/other/index.d.ts': 'export {}',
          },
          'demo',
          '1.0.0',
        )
      ).toThrow(/Unexpected absolute fixture path/)
    }),
  )

  scenario(
    'Should_RefuseMissingPackageJson_When_TreeHasNoPackageJson',
    Effect.sync(() => {
      expect(() =>
        createPackage(
          {
            'index.d.ts': 'export {}',
          },
          'demo',
          '1.0.0',
        )
      ).toThrow(/Must contain package\.json/)
    }),
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

  scenario(
    'Should_RoundTripUint8Array_When_BodyIsBytes',
    Effect.sync(() => {
      const content = 'export declare const x: number'
      const pkg = createPackage(
        {
          'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
          'index.d.ts': new TextEncoder().encode(content),
        },
        'demo',
        '1.0.0',
      )

      expect(pkg.readFile('/node_modules/demo/index.d.ts')).toBe(content)
      expect(pkg.fileExists('/node_modules/demo/index.d.ts')).toBe(true)
    }),
  )

  scenario(
    'Should_PreferConstructorArgs_When_PackageJsonNameVersionDisagree',
    Effect.sync(() => {
      const pkg = createPackage(
        {
          'package.json': JSON.stringify({ name: 'other', version: '9.9.9' }),
          'index.d.ts': 'export {}',
        },
        'demo',
        '1.0.0',
      )

      expect(pkg.packageName).toBe('demo')
      expect(pkg.packageVersion).toBe('1.0.0')
      expect(pkg.fileExists('/node_modules/demo/package.json')).toBe(true)
      expect(pkg.fileExists('/node_modules/other/package.json')).toBe(false)
    }),
  )
})
