/**
 * Execution proof that the generated obligation-coverage suite actually
 * fails on an inadequately-refuted package and passes on a well-refuted one.
 *
 * The suite under test is produced by `generateRefutationCoverage` and then
 * run as a child vitest process. Fixtures live inside this package's own
 * `tests/__fixtures__/` tree so workspace resolution reaches
 * `@systemfsoftware/effect-schema-law/refutation` — a fixture in an OS temp
 * directory cannot.
 */
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect } from 'vitest'

import { generateRefutationCoverage, REFUTATION_FILE_BASENAME } from '@systemfsoftware/effect-schema-refutation-vite'

const Feature = makeFeature({ it, layer })

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(TEST_DIR, '..')
const DISCHARGED_SRC = join(TEST_DIR, '__fixtures__', 'discharged', 'src')
const INADEQUATE_SRC = join(TEST_DIR, '__fixtures__', 'inadequate', 'src')

const runGeneratedSuite = (srcDir: string) => {
  const generatedPath = join(srcDir, REFUTATION_FILE_BASENAME)
  const body = generateRefutationCoverage(generatedPath, srcDir)
  writeFileSync(generatedPath, body)
  // `--coverage.enabled=false` is load-bearing, not tidiness. The shared config
  // turns coverage on whenever `CI` or `COVERAGE` is set, the child inherits
  // that environment, and it runs with this package's own cwd — so both
  // processes claim one `coverage/.tmp`. The child clearing it kills the parent
  // with `Something removed the coverage directory`, after every assertion here
  // has already passed: a green suite and a red job. What this child is for is
  // its exit code, which coverage instrumentation does not affect.
  return spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', generatedPath, '--reporter=verbose', '--coverage.enabled=false'],
    {
      cwd: PKG_ROOT,
      encoding: 'utf8',
      env: { ...process.env, VITEST_FIXTURE_RUN: '1' },
    },
  )
}

afterAll(() => {
  for (const srcDir of [DISCHARGED_SRC, INADEQUATE_SRC]) {
    rmSync(join(srcDir, REFUTATION_FILE_BASENAME), { force: true })
  }
})

Feature('Generated suite execution proves coverage', { timeout: 60_000 }).body(({ scenario }) => {
  scenario(
    'Should_Pass_When_DischargedFixtureSuiteIsRun',
    Gherkin.Do.pipe(
      Given('a discharged fixture inside this package')('srcDir', () => Effect.succeed(DISCHARGED_SRC)),
      When('the plugin generates its suite and vitest runs that file')(
        'result',
        (s) => Effect.sync(() => runGeneratedSuite(s.srcDir)),
      ),
      Then('the child vitest exits 0')((s) => {
        const output = String(s.result.stdout ?? '') + String(s.result.stderr ?? '')
        expect(s.result.status).toBe(0)
        expect(output).toContain('every obligation reachable from an exported schema is refuted somewhere')
      }),
    ),
  )

  scenario(
    'Should_FailAndNameSchema_When_InadequateFixtureSuiteIsRun',
    Gherkin.Do.pipe(
      Given('an inadequate fixture inside this package')('srcDir', () => Effect.succeed(INADEQUATE_SRC)),
      When('the plugin generates its suite and vitest runs that file')(
        'result',
        (s) => Effect.sync(() => runGeneratedSuite(s.srcDir)),
      ),
      Then('the child vitest exits non-zero and names the uncovered schema')((s) => {
        const output = String(s.result.stdout ?? '') + String(s.result.stderr ?? '')
        expect(s.result.status).not.toBe(0)
        expect(s.result.status).not.toBeNull()
        expect(output).toContain('Constrained')
        expect(output).toContain('schema(s) reaching an obligation no refutes call discharges')
      }),
    ),
  )
})
