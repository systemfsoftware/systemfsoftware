/**
 * The conformance lane: which packages a run leaves conformance files out of, and what the gate
 * reports for a run left without them.
 */
import { rmSync } from 'node:fs'

import { afterEach, describe, expect, it } from 'vitest'

import {
  hasConformanceFiles,
  laneLeavesOutConformance,
  PR_LANE_PARTIAL,
  reporterFor,
} from '../lib/conformance-coverage.js'
import { fixturePackage } from './__fixtures__/fixture-package.js'

/** The fixture directories a case created, removed after it so a failed case leaves no tree behind. */
const created = []

const fixture = (name, files) => {
  const dir = fixturePackage(name, files)
  created.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/**
 * @param {string | undefined} lane
 * @param {Function} body
 * @returns {Promise<unknown>}
 */
const withLane = async (lane, body) => {
  const previous = process.env['VITEST_LANE']
  if (lane === undefined) delete process.env['VITEST_LANE']
  else process.env['VITEST_LANE'] = lane
  try {
    return await body()
  } finally {
    if (previous === undefined) delete process.env['VITEST_LANE']
    else process.env['VITEST_LANE'] = previous
  }
}

describe('the conformance lane', () => {
  it('leaves conformance files out only in the pr lane, and only of a package that keeps them', async () => {
    const keeps = fixture('@systemfsoftware/lane-keeps', ['tests/thing.conformance.test.ts'])
    const keepsNone = fixture('@systemfsoftware/lane-keeps-none', ['tests/thing.test.ts'])
    expect(await hasConformanceFiles(keeps)).toBe(true)
    expect(await hasConformanceFiles(keepsNone)).toBe(false)
    await withLane('pr', async () => {
      expect(await laneLeavesOutConformance(keeps)).toBe(true)
      expect(await laneLeavesOutConformance(keepsNone)).toBe(false)
    })
    await withLane(undefined, async () => {
      expect(await laneLeavesOutConformance(keeps)).toBe(false)
    })
  })

  it('reports a run left without conformance files as not judged, and gives up no exit code', async () => {
    const lines = []
    const exit = process.exitCode
    // The stub carries only a logger: the lane verdict must be reached without reading a run.
    await reporterFor({
      name: '@systemfsoftware/lane-keeps',
      leavesOutConformance: true,
      vitest: { logger: { log: (line) => lines.push(line) } },
    }).onTestRunEnd([], [], 'passed')
    expect(lines.join('\n')).toContain(`not judged, ${PR_LANE_PARTIAL}`)
    expect(process.exitCode).toEqual(exit)
  })
})
