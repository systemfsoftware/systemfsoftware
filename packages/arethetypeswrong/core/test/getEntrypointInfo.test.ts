import { assert, describe, test } from 'vitest'
import { checkPackage } from '../src/checkPackage.ts'
import { createTestPackage } from './utils.ts'

describe('getEntrypointInfo', () => {
  test('skips exports subpaths with null targets', async () => {
    const result = await checkPackage(
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
    )

    assert('entrypoints' in result)
    assert.deepStrictEqual(Object.keys(result.entrypoints), ['./features/*.js', './browser'])
  })
})
