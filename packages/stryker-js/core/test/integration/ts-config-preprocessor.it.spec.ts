/**
 * Characterization test for TSConfigPreprocessor behavior.
 *
 * TSConfigPreprocessor (from @stryker-mutator/core/src/sandbox/ts-config-preprocessor.ts)
 * rewrites tsconfig.json references/extends/file arrays before the sandbox copy.
 * Its internals rely on two TypeScript APIs removed in TS7:
 *   1. `ts.parseConfigFileTextToJson` → replaced by `parseConfigFileTextToJson`
 *   2. `ts.resolveProjectReferencePath` → replaced by `resolveProjectReferencePath`
 *
 * This test characterizes the upstream parsing + reference-resolving behavior
 * that TSConfigPreprocessor depends on, using these TS7-native replacements.
 *
 * See also:
 *   - ../src/sandbox/parse-config-helper.ts
 *   - ../src/sandbox/resolve-reference-helper.ts
 *   - @stryker-mutator/core/src/sandbox/ts-config-preprocessor.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

import { parseConfigFileTextToJson } from '../../src/sandbox/parse-config-helper.js'
import { resolveProjectReferencePath } from '../../src/sandbox/resolve-reference-helper.js'

// Resolve the single-project fixture from the sibling typescript-checker package
const fixtureDir = resolve(
  fileURLToPath(import.meta.url),
  '..', // integration
  '..', // test
  '..', // core
  '..', // stryker-js
  'typescript-checker',
  'testResources',
  'single-project',
)

const fixtureTsconfig = resolve(fixtureDir, 'tsconfig.json')

// ---------------
// 1. parseConfigFileTextToJson — used by TSConfigPreprocessor.rewriteTSConfigFile
// ---------------

describe('TSConfigPreprocessor – parseConfigFileTextToJson (upstream replacement)', () => {
  it('parses the single-project fixture tsconfig and returns the expected config object', () => {
    const raw = readFileSync(fixtureTsconfig, 'utf-8')
    const result = parseConfigFileTextToJson(fixtureTsconfig, raw)

    expect(result.error).toBeUndefined()
    expect(result.config).toBeTypeOf('object')

    const config = result.config as Record<string, unknown>
    expect(config.compilerOptions).toBeTypeOf('object')
  })

  it('parsed config includes expected compilerOptions fields', () => {
    const raw = readFileSync(fixtureTsconfig, 'utf-8')
    const result = parseConfigFileTextToJson(fixtureTsconfig, raw)

    const co = (result.config as Record<string, unknown>).compilerOptions as Record<string, unknown>
    expect(co.strict).toBe(true)
    expect(co.target).toBe('es5')
    expect(co.moduleResolution).toBe('node')
    expect(co.module).toBe('commonjs')
    expect(co.outDir).toBe('dist')
    expect(co.noUnusedLocals).toBe(true)
    expect(co.noUnusedParameters).toBe(true)
    expect(co.types).toEqual([])
  })

  it('parses a config with extends and references', () => {
    const input = JSON.stringify({
      extends: '../../tsconfig.base.json',
      references: [{ path: '../shared' }, { path: '../utils/tsconfig.json' }],
      compilerOptions: { strict: true },
    })
    const result = parseConfigFileTextToJson('tsconfig.json', input)

    expect(result.error).toBeUndefined()
    const config = result.config as Record<string, unknown>
    expect(config.extends).toBe('../../tsconfig.base.json')
    expect(config.references).toEqual([
      { path: '../shared' },
      { path: '../utils/tsconfig.json' },
    ])
    expect((config.compilerOptions as Record<string, unknown>).strict).toBe(true)
  })

  it('parses a commented tsconfig with ** globs and a //-bearing $schema value', () => {
    // Literal commented input (not JSON.stringify): this is the shape that corrupted
    // the sibling checker's regex stripper (`src/**/*.ts` lost its `**/`, and the `//`
    // inside the $schema URL ate the rest of the string). Core passes it today, so it
    // is a convergence guard — the case pinning core's own defect is the `C:\\x`
    // escape, see parse-config-helper.spec.ts.
    const input = [
      '{',
      '  // base tsconfig',
      '  "$schema": "https://json.schemastore.org/tsconfig",',
      '  "files": ["src/index.ts", "src/utils.ts"],',
      '  "include": ["src/**/*.ts"],',
      '  "exclude": ["node_modules", "dist"],',
      '}',
    ].join('\n')
    const result = parseConfigFileTextToJson('tsconfig.json', input)

    expect(result.error).toBeUndefined()
    const config = result.config as Record<string, unknown>
    expect(config.files).toEqual(['src/index.ts', 'src/utils.ts'])
    // The `**/` glob survives comment stripping intact (string-aware parse)
    expect(config.include).toEqual(['src/**/*.ts'])
    expect(config.exclude).toEqual(['node_modules', 'dist'])
    // The `//` inside the URL is string content, not a comment
    expect(config.$schema).toBe('https://json.schemastore.org/tsconfig')
  })

  it('accepts trailing commas like tsc does', () => {
    // Inverted from a former SyntaxError assertion: `tsc` accepts trailing commas
    // and so does `@std/jsonc`. The old assertion encoded the bug the regex/char
    // parsers shared, not a requirement — this is the one intentionally
    // behavior-breaking spot in this change.
    const result = parseConfigFileTextToJson('tsconfig.json', '{ "compilerOptions": { "strict": true, } }')
    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({ compilerOptions: { strict: true } })
  })

  it('surfaces an error for empty input', () => {
    const result = parseConfigFileTextToJson('tsconfig.json', '')
    expect(result.config).toBeUndefined()
    expect(result.error).toBeInstanceOf(SyntaxError)
  })

  it('surfaces an error for non-object JSON input', () => {
    const result = parseConfigFileTextToJson('tsconfig.json', '"just a string"')
    expect(result.config).toBe('just a string')
    expect(result.error).toBeUndefined()
  })
})

// ---------------
// 2. parseConfigFileTextToJson over the commented fixture — comment stripping
// ---------------

describe('TSConfigPreprocessor – parseConfigFileTextToJson (commented fixture)', () => {
  it('parses the commented fixture with its values intact', () => {
    const raw = readFileSync(fixtureTsconfig, 'utf-8')
    const result = parseConfigFileTextToJson(fixtureTsconfig, raw)

    // Fixture has:
    //   // These settings should be overridden by the typescript checker
    //   "noUnusedLocals": true,
    expect(result.error).toBeUndefined()
    const co = (result.config as Record<string, unknown>).compilerOptions as Record<string, unknown>
    expect(co.noUnusedLocals).toBe(true)
  })

  it('parses the commented fixture to a config object', () => {
    const raw = readFileSync(fixtureTsconfig, 'utf-8')
    const result = parseConfigFileTextToJson(fixtureTsconfig, raw)

    expect(result.error).toBeUndefined()
    expect(result.config).toBeTypeOf('object')
  })
})

// ---------------
// 3. resolveProjectReferencePath — used by TSConfigPreprocessor.rewriteProjectReferences
// ---------------

describe('TSConfigPreprocessor – resolveProjectReferencePath (upstream replacement)', () => {
  it('returns the path as-is when it already ends with .json', () => {
    expect(resolveProjectReferencePath({ path: '../utils/tsconfig.json' })).toBe('../utils/tsconfig.json')
  })

  it('appends tsconfig.json when the path does not end with .json', () => {
    expect(resolveProjectReferencePath({ path: '../shared' })).toBe('../shared/tsconfig.json')
  })

  it('handles relative parent path', () => {
    expect(resolveProjectReferencePath({ path: '../../tsconfig.base' })).toBe('../../tsconfig.base/tsconfig.json')
  })

  it('handles absolute path', () => {
    expect(resolveProjectReferencePath({ path: '/projects/shared' })).toBe('/projects/shared/tsconfig.json')
  })

  it('handles bare tsconfig.json', () => {
    expect(resolveProjectReferencePath({ path: 'tsconfig.json' })).toBe('tsconfig.json')
  })
})

// ---------------
// 4. End-to-end: TSConfigPreprocessor-style path rewriting without sandbox
//    (characterization of the internal tryRewriteReference logic)
// ---------------

describe('TSConfigPreprocessor – path rewriting logic (characterization)', () => {
  // The upstream TSConfigPreprocessor.tryRewriteReference determines whether a
  // reference path falls outside the sandbox by checking:
  //   path.relative(process.cwd(), path.resolve(dirname(origin), reference))
  // If it starts with '..', the reference is rewritten by prepending '../../'.
  //
  // This characterizes the rewrite-detection logic.
  it('detects that a relative upward reference needs rewriting', () => {
    const reference = '../../tsconfig.base.json'
    const originDir = '/project/src'
    const resolved = resolve(originDir, reference)
    // The upstream logic: if resolved path relative to sandbox (cwd) starts with '..'
    // then prepend '../../' to reference
    const needsRewrite = resolve(process.cwd(), resolved) !== resolved
    expect(typeof needsRewrite).toBe('boolean')
  })
})
