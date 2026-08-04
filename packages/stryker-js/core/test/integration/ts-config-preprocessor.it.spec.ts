/**
 * Characterization test for TSConfigPreprocessor behavior.
 *
 * TSConfigPreprocessor (from @stryker-mutator/core/src/sandbox/ts-config-preprocessor.ts)
 * rewrites tsconfig.json references/extends/file arrays before the sandbox copy.
 * Its internals rely on two TypeScript APIs removed in TS7:
 *   1. `ts.parseConfigFileTextToJson` → replaced by `parseTsConfig`
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

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

import { Logger } from '@stryker-mutator/api/logging'
import { Either } from 'effect'
import { afterEach, describe, expect, it, Mock, vi } from 'vitest'

import { createDefaultOptions } from '../../src/config/options-validator.js'
import { FileSystem } from '../../src/fs/file-system.js'
import { ProjectFile } from '../../src/fs/project-file.js'
import { Project } from '../../src/fs/project.js'
import { parseTsConfig, TsConfigParseError } from '../../src/sandbox/parse-config-helper.js'
import { resolveProjectReferencePath } from '../../src/sandbox/resolve-reference-helper.js'
import { TSConfigPreprocessor } from '../../src/sandbox/ts-config-preprocessor.js'

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

function expectRight<A>(either: Either.Either<A, TsConfigParseError>): A {
  if (Either.isLeft(either)) {
    throw new Error(`Expected a Right result, got a Left: ${String(either.left)}`)
  }
  return either.right
}

// ---------------
// 1. parseTsConfig — used by TSConfigPreprocessor.rewriteTSConfigFile
// ---------------

describe('TSConfigPreprocessor – parseTsConfig (upstream replacement)', () => {
  it('parses the single-project fixture tsconfig and returns the expected config object', () => {
    const raw = readFileSync(fixtureTsconfig, 'utf-8')
    const config = expectRight(parseTsConfig(fixtureTsconfig, raw))

    expect(config).toBeTypeOf('object')
    expect(config.compilerOptions).toBeTypeOf('object')
  })

  it('parsed config includes expected compilerOptions fields', () => {
    const raw = readFileSync(fixtureTsconfig, 'utf-8')
    const config = expectRight(parseTsConfig(fixtureTsconfig, raw))

    expect(config.compilerOptions).toMatchObject({
      strict: true,
      target: 'es5',
      moduleResolution: 'node',
      module: 'commonjs',
      outDir: 'dist',
      noUnusedLocals: true,
      noUnusedParameters: true,
      types: [],
    })
  })

  it('parses a config with extends and references', () => {
    const input = JSON.stringify({
      extends: '../../tsconfig.base.json',
      references: [{ path: '../shared' }, { path: '../utils/tsconfig.json' }],
      compilerOptions: { strict: true },
    })
    const config = expectRight(parseTsConfig('tsconfig.json', input))

    expect(config.extends).toBe('../../tsconfig.base.json')
    expect(config.references).toEqual([
      { path: '../shared' },
      { path: '../utils/tsconfig.json' },
    ])
    expect(config.compilerOptions).toMatchObject({ strict: true })
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
    const config = expectRight(parseTsConfig('tsconfig.json', input))

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
    const config = expectRight(
      parseTsConfig('tsconfig.json', '{ "compilerOptions": { "strict": true, } }'),
    )
    expect(config).toEqual({ compilerOptions: { strict: true } })
  })

  it('surfaces an error for empty input', () => {
    const result = parseTsConfig('tsconfig.json', '')
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(TsConfigParseError)
      expect(result.left.file).toBe('tsconfig.json')
      expect(result.left.reason.length).toBeGreaterThan(0)
    }
  })

  it('rejects a non-object JSON root (a bare string is not a tsconfig)', () => {
    // The old boundary returned `{ config: 'just a string' }` and the `if (config)`
    // gate accepted the truthy string — a bare-string tsconfig passed the gate, got
    // no fields rewritten, and was written straight back. The schema guard turns
    // this into a Left.
    const result = parseTsConfig('tsconfig.json', '"just a string"')
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(TsConfigParseError)
      expect(result.left.file).toBe('tsconfig.json')
      expect(result.left.reason).toContain('does not match the tsconfig shape')
    }
  })
})

// ---------------
// 2. parseTsConfig over the commented fixture — comment stripping
// ---------------

describe('TSConfigPreprocessor – parseTsConfig (commented fixture)', () => {
  it('parses the commented fixture with its values intact', () => {
    const raw = readFileSync(fixtureTsconfig, 'utf-8')
    const config = expectRight(parseTsConfig(fixtureTsconfig, raw))

    // Fixture has:
    //   // These settings should be overridden by the typescript checker
    //   "noUnusedLocals": true,
    expect(config.compilerOptions).toMatchObject({ noUnusedLocals: true })
  })

  it('parses the commented fixture to a config object', () => {
    const raw = readFileSync(fixtureTsconfig, 'utf-8')
    const config = expectRight(parseTsConfig(fixtureTsconfig, raw))

    expect(config).toBeTypeOf('object')
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
// 4. End-to-end: TSConfigPreprocessor over a real project
//    (boundary soundness + write-back round-trip)
// ---------------

// The preprocessor writes rewritten tsconfigs back with `JSON.stringify(config, null, 2)`. The parse
// boundary must not rebuild the object (a decode would hoist declared schema fields), so these tests
// pin that the written content keeps every key and the original key order.

// The tsconfig must live inside cwd (under git-ignored `.stryker-tmp`) so reference/include paths are
// NOT rewritten — otherwise the values the round-trip test asserts would change.
const tempRoot = resolve(process.cwd(), '.stryker-tmp', 'ts-config-preprocessor-it')

function createTempTsconfig(caseName: string, content: string): string {
  const dir = join(tempRoot, caseName)
  mkdirSync(dir, { recursive: true })
  const tsconfigPath = join(dir, 'tsconfig.json')
  writeFileSync(tsconfigPath, content, 'utf-8')
  return tsconfigPath
}

interface PreprocessorSut {
  project: Project
  tsconfigFile: ProjectFile
  preprocessor: TSConfigPreprocessor
  warn: Mock
}

function createSut(tsconfigPath: string): PreprocessorSut {
  const warn = vi.fn()
  const log: Logger = {
    isTraceEnabled: () => false,
    isDebugEnabled: () => false,
    isInfoEnabled: () => false,
    isWarnEnabled: () => true,
    isErrorEnabled: () => false,
    isFatalEnabled: () => false,
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn,
    error: () => {},
    fatal: () => {},
  }
  const options = createDefaultOptions()
  options.tsconfigFile = tsconfigPath
  const preprocessor = new TSConfigPreprocessor(log, options)
  const project = new Project(new FileSystem(), { [tsconfigPath]: { mutate: false } })
  const tsconfigFile = project.files.get(tsconfigPath)
  if (!tsconfigFile) {
    throw new Error(`Expected ${tsconfigPath} to be part of the project`)
  }
  return { project, tsconfigFile, preprocessor, warn }
}

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('TSConfigPreprocessor – boundary soundness', () => {
  it('reports a bare-string tsconfig root through the warn branch instead of rewriting it', async () => {
    const tsconfigPath = createTempTsconfig('bare-string', '"just a string"')
    const { project, tsconfigFile, preprocessor, warn } = createSut(tsconfigPath)

    await preprocessor.preprocess(project)

    // A bare JSON string is truthy, so the old `if (config)` gate let it through without warning.
    expect(warn).toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not rewrite tsconfig file'),
      tsconfigPath,
      expect.stringContaining('does not match the tsconfig shape'),
    )
    expect(await tsconfigFile.readContent()).toBe('"just a string"')
  })

  it('warns and leaves the file untouched when the tsconfig cannot be parsed', async () => {
    const tsconfigPath = createTempTsconfig('malformed', '{"compilerOptions": {')
    const { project, tsconfigFile, preprocessor, warn } = createSut(tsconfigPath)

    await preprocessor.preprocess(project)

    // Truncated JSON makes @std/jsonc's parse throw, taking the warn branch — distinct
    // from the bare-string shape mismatch above — so rewriting is skipped and the
    // file's original content is left in place.
    expect(warn).toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not rewrite tsconfig file'),
      tsconfigPath,
      expect.stringContaining('Cannot parse JSONC'),
    )
    expect(warn.mock.calls[0][0]).toContain('were not rewritten for the sandbox')
    expect(await tsconfigFile.readContent()).toBe('{"compilerOptions": {')
  })
})

describe('TSConfigPreprocessor – round-trip key preservation', () => {
  it('writes back every key in the original order', async () => {
    const input = {
      $schema: 'https://json.schemastore.org/tsconfig',
      compilerOptions: { strict: true },
      include: ['src/**/*.ts'],
      references: [{ label: 'app', path: 'tsconfig.app.json' }],
    }
    const tsconfigPath = createTempTsconfig('round-trip', JSON.stringify(input, null, 2))
    const { project, tsconfigFile, preprocessor } = createSut(tsconfigPath)

    await preprocessor.preprocess(project)

    const written = JSON.parse(await tsconfigFile.readContent())
    expect(Object.keys(written)).toEqual(['$schema', 'compilerOptions', 'include', 'references'])
    expect(Object.keys(written.references[0])).toEqual(['label', 'path'])
    expect(written).toEqual(input)
  })
})
