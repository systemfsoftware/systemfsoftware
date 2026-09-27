import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { check, exitCodeOfCheck } from '@systemfsoftware/systemf'
import { afterAll } from '@systemfsoftware/vitest'
import { Effect, Result } from 'effect'
import { cleanupFixtures, writeFixture } from './__fixtures__/fixture-package.js'

const Feature = makeFeature({ it })

const SOURCE_IS_A_FILE = writeFixture({
  prefix: 'stops-broken-src-',
  name: '@systemfsoftware/broken',
  files: [{ path: 'src', contents: 'not a directory\n' }],
})

const NO_TSCONFIG = writeFixture({
  prefix: 'stops-no-tsconfig-',
  name: '@systemfsoftware/no-tsconfig',
  noTsconfig: true,
  files: [{ path: 'src/mod.ts', contents: 'export const answer = 42\n' }],
})

const FIXTURES = [SOURCE_IS_A_FILE, NO_TSCONFIG]

afterAll(() => {
  cleanupFixtures(FIXTURES)
})

Feature('A package the check cannot read fails, naming what it could not read')
  .live('each scenario reads a real fixture package on disk')
  .withLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'A `src` that is not a directory is a finding that fails the gate',
      Gherkin.Do.pipe(
        Given('a package whose `src` is a file')('pkg', () => Effect.succeed(SOURCE_IS_A_FILE)),
        When('the check runs over it')('data', (s) => check({ cwd: '.', packages: [s.pkg] })),
        Then('it reports a sources-readable finding and exits 1')((s, expect) =>
          expect({
            exitCode: exitCodeOfCheck(s.data),
            rule: s.data.findings[0]?.rule,
            file: s.data.findings[0]?.file,
            names: s.data.findings[0]?.message.includes('src is not a directory'),
          }).toEqual({ exitCode: 1, rule: 'sources-readable', file: 'src', names: true })
        ),
      ),
    )

    scenario(
      'A package with neither tsconfig fails, naming both paths searched',
      Gherkin.Do.pipe(
        Given('a package that declares no tsconfig')('pkg', () => Effect.succeed(NO_TSCONFIG)),
        When('the check runs over it')('result', (s) => Effect.result(check({ cwd: '.', packages: [s.pkg] }))),
        Then('it fails with ERR_TSCONFIG_NOT_FOUND, naming both candidates')((s, expect) =>
          expect(
            Result.match(s.result, {
              onFailure: (failure) => ({
                code: failure.code,
                searchedTest: failure.message.includes('tsconfig.test.json'),
                searchedPlain: failure.message.includes('tsconfig.json'),
              }),
              onSuccess: () => ({ code: 'none', searchedTest: false, searchedPlain: false }),
            }),
          ).toEqual({ code: 'ERR_TSCONFIG_NOT_FOUND', searchedTest: true, searchedPlain: true })
        ),
      ),
    )
  })
