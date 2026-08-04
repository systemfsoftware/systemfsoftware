import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { Either } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import {
  determineBuildModeEnabled,
  overrideOptions,
  parseTsConfig,
  TsConfigParseError,
} from '../../src/tsconfig-helpers.js'

function expectRight<A, E>(either: Either.Either<A, E>): A {
  if (Either.isLeft(either)) {
    throw new Error(`Expected a Right result, got a Left: ${String(either.left)}`)
  }
  return either.right
}

describe('parseTsConfig', () => {
  it('should preserve a glob pattern in include exactly', () => {
    const config = expectRight(
      parseTsConfig('tsconfig.json', '{"include":["src/**/*.workflow.ts"]}'),
    )
    expect(config).toEqual({ include: ['src/**/*.workflow.ts'] })
  })

  it('should round-trip a $schema URL unchanged', () => {
    const config = expectRight(
      parseTsConfig('tsconfig.json', '{"$schema":"https://json.schemastore.org/tsconfig"}'),
    )
    expect(config).toEqual({
      $schema: 'https://json.schemastore.org/tsconfig',
    })
  })

  it('should round-trip a Windows path and an escaped quote unchanged', () => {
    const config = expectRight(
      parseTsConfig(
        'tsconfig.json',
        '{"paths":{"a":["C:\\\\x//y"]},"description":"he said \\"hi\\""}',
      ),
    )
    expect(config).toEqual({
      paths: { a: ['C:\\x//y'] },
      description: 'he said "hi"',
    })
  })

  it('should accept trailing commas in nested objects and arrays', () => {
    const config = expectRight(
      parseTsConfig(
        'tsconfig.json',
        '{"compilerOptions":{"strict":true,},"include":["a.ts","b.ts",]}',
      ),
    )
    expect(config).toEqual({
      compilerOptions: { strict: true },
      include: ['a.ts', 'b.ts'],
    })
  })

  it('should accept content prefixed with a BOM', () => {
    const withoutBom = expectRight(
      parseTsConfig('tsconfig.json', '{"compilerOptions":{"strict":true}}'),
    )
    const withBom = expectRight(
      parseTsConfig('tsconfig.json', '\uFEFF{"compilerOptions":{"strict":true}}'),
    )
    expect(withBom).toEqual(withoutBom)
  })

  it('should strip line and block comments', () => {
    const config = expectRight(
      parseTsConfig(
        'tsconfig.json',
        '{\n// a line comment\n"a": 1,\n/* a block comment */\n"b": 2\n}',
      ),
    )
    expect(config).toEqual({ a: 1, b: 2 })
  })

  it('should preserve unknown nested keys inside compilerOptions', () => {
    const config = expectRight(
      parseTsConfig(
        'tsconfig.json',
        '{"compilerOptions":{"strict":true,"experimentalDecorators":true}}',
      ),
    )
    expect(config.compilerOptions).toEqual({
      strict: true,
      experimentalDecorators: true,
    })
  })

  it('should return a Left for a malformed document', () => {
    const result = parseTsConfig('tsconfig.json', '{ "a": }')
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(TsConfigParseError)
      expect(result.left.file).toBe('tsconfig.json')
      expect(result.left.reason.length).toBeGreaterThan(0)
    }
  })

  it('should return a Left for truncated input', () => {
    for (const truncated of ['{', '{"a":']) {
      expect(Either.isLeft(parseTsConfig('tsconfig.json', truncated))).toBe(true)
    }
  })

  it('should return a Left for an unterminated block comment', () => {
    const result = parseTsConfig('tsconfig.json', '{"a":1,/* never closed')
    expect(Either.isLeft(result)).toBe(true)
  })

  it('should return a Left for a bare string root (not a config object)', () => {
    const result = parseTsConfig('tsconfig.json', '"just a string"')
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(TsConfigParseError)
      expect(result.left.file).toBe('tsconfig.json')
      expect(result.left.reason.length).toBeGreaterThan(0)
    }
  })

  it('should return a Left when references is not an array', () => {
    const result = parseTsConfig('tsconfig.json', '{"references":"nope"}')
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(TsConfigParseError)
      expect(result.left.reason.length).toBeGreaterThan(0)
    }
  })
})

describe('overrideOptions', () => {
  it('should apply the compiler-option overrides to an empty config', () => {
    const parsed = JSON.parse(overrideOptions({}, false))
    expect(parsed.compilerOptions).toMatchObject({
      allowUnreachableCode: true,
      noEmit: true,
      target: 'es2022',
      moduleResolution: 'bundler',
    })
  })

  it('should preserve unknown top-level keys and unknown compilerOptions through to the output', () => {
    const config = expectRight(
      parseTsConfig(
        'tsconfig.json',
        '{"include":["src/**/*.ts"],"compilerOptions":{"strict":true,"experimentalDecorators":true}}',
      ),
    )
    const output = JSON.parse(overrideOptions(config, false))
    expect(output.include).toEqual(['src/**/*.ts'])
    expect(output.compilerOptions.strict).toBe(true)
    expect(output.compilerOptions.experimentalDecorators).toBe(true)
  })
})

describe('determineBuildModeEnabled', () => {
  let tempDir: string | undefined

  afterEach(() => {
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  function createTsconfig(content: string): string {
    tempDir = mkdtempSync(path.join(tmpdir(), 'tsconfig-helpers-'))
    const tsconfigPath = path.join(tempDir, 'tsconfig.json')
    writeFileSync(tsconfigPath, content)
    return tsconfigPath
  }

  it('should return true when the config has references', () => {
    const tsconfigPath = createTsconfig('{"references":[{"path":"./a"}]}')
    expect(determineBuildModeEnabled(tsconfigPath)).toBe(true)
  })

  it('should return false when the config has no references', () => {
    const tsconfigPath = createTsconfig('{"compilerOptions":{"strict":true}}')
    expect(determineBuildModeEnabled(tsconfigPath)).toBe(false)
  })

  it('should return false when the config is a bare string instead of throwing a TypeError', () => {
    const tsconfigPath = createTsconfig('"just a string"')
    expect(determineBuildModeEnabled(tsconfigPath)).toBe(false)
  })

  it('should return false when references is not an array', () => {
    const tsconfigPath = createTsconfig('{"references":"nope"}')
    expect(determineBuildModeEnabled(tsconfigPath)).toBe(false)
  })
})
