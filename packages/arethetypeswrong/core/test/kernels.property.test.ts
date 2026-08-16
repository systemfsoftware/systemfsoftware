import { it } from '@effect/vitest'
import { Result } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { describe, expect } from 'vitest'

import { allBuildTools, getBuildTools } from '../src/build-tools.kernel.js'
import { formatEntrypointString, getSubpaths, hasExportTarget } from '../src/entrypoint-discovery.kernel.js'
import { resolvedThroughFallback } from '../src/fallback.kernel.js'
import { parsePackageSpec } from '../src/package-spec.kernel.js'

describe('fallback kernel', () => {
  it.prop(
    'resolvedThroughFallback returns false on empty or trivial traces',
    [
      fc.array(
        fc.oneof(
          fc.constant('Entering conditional exports.'),
          fc.constant('Exiting conditional exports.'),
          fc.string().map((s) => `Failed to resolve under condition '${s}'`),
          fc.string().map((s) => `Resolved under condition '${s}'`),
          fc.string(),
        ),
        { minLength: 0, maxLength: 20 },
      ),
    ],
    ([traces]) => {
      expect(typeof resolvedThroughFallback(traces)).toBe('boolean')
    },
  )

  it('resolvedThroughFallback detects a Resolved after Failed under Entering/Exiting', () => {
    const traces = [
      'Entering conditional exports.',
      "Failed to resolve under condition 'types'",
      "Resolved under condition 'import'",
      'Exiting conditional exports.',
    ]
    expect(resolvedThroughFallback(traces)).toBe(true)
  })

  it('resolvedThroughFallback returns false when no failure precedes the resolution', () => {
    const traces = [
      'Entering conditional exports.',
      "Resolved under condition 'types'",
      'Exiting conditional exports.',
    ]
    expect(resolvedThroughFallback(traces)).toBe(false)
  })
})

describe('build-tools kernel', () => {
  it.prop(
    'getBuildTools never produces entries outside allBuildTools',
    [fc.dictionary(fc.string(), fc.string())],
    ([deps]) => {
      const result = getBuildTools({ devDependencies: deps })
      for (const key of Object.keys(result)) {
        expect(allBuildTools).toContain(key)
      }
    },
  )

  it.prop(
    'getBuildTools preserves the version string verbatim when the tool is present',
    [fc.constantFrom(...allBuildTools), fc.string()],
    ([tool, version]) => {
      const result = getBuildTools({ devDependencies: { [tool]: version } })
      expect(result[tool]).toBe(version)
    },
  )

  it('getBuildTools returns empty when devDependencies is missing', () => {
    expect(getBuildTools({})).toEqual({})
  })
})

describe('entrypoint-discovery kernel', () => {
  it('getSubpaths returns empty for null/undefined/non-object/array', () => {
    expect(getSubpaths(null)).toEqual([])
    expect(getSubpaths(undefined)).toEqual([])
    expect(getSubpaths('foo')).toEqual([])
    expect(getSubpaths([])).toEqual([])
    expect(getSubpaths(42)).toEqual([])
  })

  it('hasExportTarget is true for primitive targets, false for nullish containers', () => {
    expect(hasExportTarget(null)).toBe(false)
    expect(hasExportTarget(undefined)).toBe(false)
    expect(hasExportTarget('foo')).toBe(true)
    expect(hasExportTarget({})).toBe(false)
    expect(hasExportTarget([])).toBe(false)
  })

  it.prop(
    'formatEntrypointString returns the bare name as .',
    [fc.string({ minLength: 1 }).filter((s) => !s.startsWith('.'))],
    ([pkg]) => {
      expect(formatEntrypointString(pkg, pkg)).toBe('.')
    },
  )

  it.prop(
    'formatEntrypointString trims whitespace from already-formatted paths',
    [fc.string({ minLength: 1 })],
    ([path]) => {
      const input = `  ./${path}  `
      const result = formatEntrypointString(input, 'pkg')
      expect(result).toBe(result.trim())
      expect(result.startsWith('./')).toBe(true)
    },
  )
})

describe('package-spec kernel', () => {
  it.prop(
    'parsePackageSpec accepts a bare name with versionKind none',
    [fc.stringMatching(/^[a-z][a-z0-9-]*$/)],
    ([name]) => {
      const result = parsePackageSpec(name)
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.success.name).toBe(name)
        expect(result.success.versionKind).toBe('none')
        expect(result.success.version).toBe('')
      }
    },
  )

  it.prop(
    'parsePackageSpec accepts an exact semver version',
    [fc.stringMatching(/^[a-z][a-z0-9-]*$/), fc.constantFrom('1.0.0', '0.0.1', '10.20.30')],
    ([name, version]) => {
      const result = parsePackageSpec(`${name}@${version}`)
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.success.versionKind).toBe('exact')
        expect(result.success.version).toBe(version)
      }
    },
  )

  it.prop(
    'parsePackageSpec accepts a semver range as versionKind range',
    [fc.stringMatching(/^[a-z][a-z0-9-]*$/), fc.constantFrom('^1.0.0', '~2.0', '>=3.0.0')],
    ([name, range]) => {
      const result = parsePackageSpec(`${name}@${range}`)
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.success.versionKind).toBe('range')
        expect(result.success.version).toBe(range)
      }
    },
  )

  it.prop(
    'parsePackageSpec accepts a non-semver tag as versionKind tag',
    [fc.stringMatching(/^[a-z][a-z0-9-]*$/), fc.constantFrom('beta', 'latest', 'next')],
    ([name, tag]) => {
      const result = parsePackageSpec(`${name}@${tag}`)
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isSuccess(result)) {
        expect(result.success.versionKind).toBe('tag')
      }
    },
  )
  it.prop(
    'parsePackageSpec rejects input with URL-hostile characters',
    [fc.constantFrom('@/bad', '@', ' leading-space', 'trailing-space ')],
    ([input]) => {
      const result = parsePackageSpec(input)
      expect(Result.isFailure(result)).toBe(true)
    },
  )
})
