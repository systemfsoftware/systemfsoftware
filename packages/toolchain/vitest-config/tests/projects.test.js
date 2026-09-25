/**
 * The conformance lane: the split of a package's specs into a unit and a conformance project, and the
 * project list the pr lane is shaped to — the whole lane names both projects, and the pr lane leaves
 * the conformance files out.
 */
import { rmSync } from 'node:fs'

import { afterEach, describe, expect, it } from 'vitest'

import { defineConfig } from '../lib/base.js'
import { CONFORMANCE_SETUP } from '../lib/conformance-coverage.js'
import { fixturePackage } from './__fixtures__/fixture-package.js'

/** The fixture directories a case created, removed after it so a failed case leaves no tree behind. */
const created = []

const fixture = (...args) => {
  const dir = fixturePackage(...args)
  created.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/**
 * The config the fixture package builds, from inside its own directory: `defineConfig` reads the
 * working directory, the manifest and the lane when it is called, and the config it returns is a
 * promise because that read is asynchronous.
 *
 * @param {string} dir
 * @param {string | undefined} lane
 * @param {import('vitest/config').ViteUserConfig} config
 * @returns {Promise<import('vitest/config').ViteUserConfig>}
 */
const inFixture = async (dir, lane, config) => {
  const cwd = process.cwd()
  const previous = process.env['VITEST_LANE']
  process.chdir(dir)
  if (lane === undefined) delete process.env['VITEST_LANE']
  else process.env['VITEST_LANE'] = lane
  try {
    return await defineConfig(config)
  } finally {
    process.chdir(cwd)
    if (previous === undefined) delete process.env['VITEST_LANE']
    else process.env['VITEST_LANE'] = previous
  }
}

/** @param {unknown} config */
const namesOf = (config) => config.test.projects.map((project) => project.test.name)

/** @param {unknown} config */
const projectNamed = (config, name) => config.test.projects.find((project) => project.test.name === name).test

describe('a package that keeps conformance files', () => {
  const files = ['tests/thing.test.ts', 'tests/thing.conformance.test.ts']

  it('runs them in a conformance project beside the unit project', async () => {
    const config = await inFixture(fixture('@systemfsoftware/fixture-split', files), undefined, {
      test: { include: ['tests/**/*.test.ts'] },
    })
    expect(namesOf(config)).toEqual(['unit', 'conformance'])
    expect(projectNamed(config, 'unit').include).toEqual(['tests/**/*.test.ts', '!**/*.conformance.test.ts'])
    expect(projectNamed(config, 'conformance').include).toEqual(['**/*.conformance.test.ts'])
    expect(projectNamed(config, 'conformance').includeSource).toEqual([])
  })

  it('names no spec on the root, which every project inherits', async () => {
    const config = await inFixture(fixture('@systemfsoftware/fixture-root', files), undefined, {
      test: { include: ['tests/**/*.test.ts'], includeSource: ['src/**/*.ts'] },
    })
    expect(config.test.include).toEqual([])
    expect(config.test.includeSource).toEqual([])
  })

  it('gives both projects the guard and the conformance handoff', async () => {
    const config = await inFixture(fixture('@systemfsoftware/fixture-setup', files), undefined, { test: {} })
    const [unit, conformance] = config.test.projects.map((project) => project.test.setupFiles)
    expect(unit).toEqual(conformance)
    expect(unit).toContain(CONFORMANCE_SETUP)
    expect(unit.some((file) => file.endsWith('/node_modules/@systemfsoftware/vitest/guard.js'))).toBe(true)
  })

  it('runs the pr lane without the conformance project', async () => {
    const config = await inFixture(fixture('@systemfsoftware/fixture-pr', files), 'pr', {
      test: { include: ['tests/**/*.test.ts'] },
    })
    expect(namesOf(config)).toEqual(['unit'])
  })
})

describe('a package that keeps no conformance file', () => {
  it('stays the single project it is, in every lane', async () => {
    const files = ['tests/thing.test.ts']
    const config = { test: { include: ['tests/**/*.test.ts'] } }
    const configs = [
      await inFixture(fixture('@systemfsoftware/fixture-single', files), undefined, config),
      await inFixture(fixture('@systemfsoftware/fixture-single-pr', files), 'pr', config),
    ]
    for (const built of configs) {
      expect(built.test.projects).toBeUndefined()
      expect(built.test.include).toEqual(['tests/**/*.test.ts'])
    }
  })
})

describe('a package that declares its own projects', () => {
  const declared = (name) => ({
    test: {
      projects: [
        { test: { name, include: ['tests/**/*.test.ts'] } },
        { test: { name: 'conformance', include: ['tests/**/*.test.ts'] } },
      ],
    },
  })

  it('keeps every project and its specs on a whole run', async () => {
    const config = await inFixture(
      fixture('@systemfsoftware/fixture-declared', ['tests/thing.conformance.test.ts']),
      undefined,
      declared('unit'),
    )
    expect(namesOf(config)).toEqual(['unit', 'conformance'])
    expect(projectNamed(config, 'unit').include).toEqual(['tests/**/*.test.ts'])
    expect(projectNamed(config, 'conformance').include).toEqual(['tests/**/*.test.ts'])
  })

  it('keeps every project name in the pr lane, and leaves the conformance files out of all of them', async () => {
    const config = await inFixture(
      fixture('@systemfsoftware/fixture-declared-pr', ['tests/thing.conformance.test.ts']),
      'pr',
      declared('unit'),
    )
    expect(namesOf(config)).toEqual(['unit', 'conformance'])
    expect(projectNamed(config, 'unit').include).toEqual(['tests/**/*.test.ts', '!**/*.conformance.test.ts'])
    expect(projectNamed(config, 'conformance').include).toEqual([])
  })
})
