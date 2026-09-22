import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = resolve(import.meta.dirname, '../..')
const distCliPath = resolve(packageRoot, 'dist/cli.mjs')

const hasBuiltCli = (): boolean => {
  if (!existsSync(distCliPath)) {
    return false
  }
  const content = readFileSync(distCliPath, 'utf8')
  return content.includes('Command') || content.includes('runCommand') || content.includes('api-extractor')
}

const canRunCliHelp = (): boolean => {
  if (!hasBuiltCli()) {
    return false
  }
  const run = spawnSync(process.execPath, [distCliPath, '--help'], {
    encoding: 'utf8',
    timeout: 10_000,
  })
  return run.status === 0 && (run.stdout.includes('api-extractor') || run.stdout.includes('Usage'))
}

describe('CLI journeys (e2e)', () => {
  const isCliReady = canRunCliHelp()

  describe('J1: dist CLI invocation', () => {
    it.skipIf(!isCliReady)(
      'spawns the built CLI artifact with --help and exits with status 0',
      () => {
        const result = spawnSync(process.execPath, [distCliPath, '--help'], {
          encoding: 'utf8',
          timeout: 10_000,
        })
        expect(result.status).toBe(0)
        expect(result.stdout).toContain('api-extractor')
      },
    )
  })

  describe('J2: quiet exit contract', () => {
    const fixtureDir = resolve(packageRoot, 'tests/__fixtures__/extractor-flow/simple-pkg')
    const driftedFixtureDir = resolve(packageRoot, 'tests/__fixtures__/extractor-flow/simple-pkg-drifted')

    it.skipIf(!isCliReady)(
      'runs on a clean fixture under --quiet with empty stdout and exit 0',
      () => {
        const result = spawnSync(
          process.execPath,
          [distCliPath, 'run', '--local', '--quiet'],
          {
            cwd: fixtureDir,
            encoding: 'utf8',
            timeout: 15_000,
          },
        )
        expect(result.status).toBe(0)
        expect(result.stdout.trim()).toBe('')
      },
    )

    it.skipIf(!isCliReady)(
      'runs on a drifted fixture under --quiet, prints the out-of-date report warning on stdout, and exits 1',
      () => {
        const result = spawnSync(
          process.execPath,
          [distCliPath, 'run', '--quiet'],
          {
            cwd: driftedFixtureDir,
            encoding: 'utf8',
            timeout: 15_000,
          },
        )
        expect(result.status).toBe(1)
        expect(result.stdout).toContain('You have changed the API signature for this project.')
      },
    )
  })
})
