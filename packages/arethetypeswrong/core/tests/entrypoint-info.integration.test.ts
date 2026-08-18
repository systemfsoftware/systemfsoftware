import { it, layer, makeFeature, StepError } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { checkPackage } from '../src/index.ts'
import { createTestPackage } from './__fixtures__/Utils.ts'

/**
 * Entrypoint discovery — null-target subpath pruning.
 *
 * Drives the real `checkPackage` analysis over a package whose `exports` map
 * contains subpaths with `null` targets, proving that blocks whose targets are
 * null across every condition are pruned from the reported entrypoints.
 */
const Feature = makeFeature({ it, layer })

Feature('Entrypoint discovery — pruning null-target subpaths').body(({ scenario }) => {
  scenario(
    'Should_SkipExportSubpaths_When_ExportTargetIsNull',
    Effect.tryPromise({
      try: () =>
        checkPackage(
          createTestPackage({
            'dist/browser.d.ts': 'export {};',
            'dist/browser.js': 'export {};',
            'index.d.ts': 'export {};',
            'package.json': JSON.stringify({
              name: 'test',
              version: '1.0.0',
              exports: {
                './features/*.js': './src/features/*.js',
                './features/private-internal/*': null,
                './browser': {
                  node: null,
                  default: './dist/browser.js',
                },
                './blocked': {
                  node: null,
                  default: null,
                },
              },
            }),
            'src/features/public.js': 'export {};',
            'src/features/private-internal/hidden.js': 'export {};',
          }),
        ),
      catch: (cause) => new StepError({ keyword: 'scenario', text: 'checkPackage failed', cause }),
    }).pipe(
      Effect.flatMap((result) => {
        if (!('entrypoints' in result)) {
          return Effect.fail(new StepError({ keyword: 'scenario', text: 'Expected analysis', cause: result }))
        }
        expect(Object.keys(result.entrypoints)).toEqual(['./features/*.js', './browser'])
        return Effect.succeed(undefined)
      }),
    ),
  )
})
