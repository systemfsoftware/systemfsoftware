import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { runStopEnrollmentCli } from '@systemfsoftware/stop-enrollment'
import { afterAll } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
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
      'A `src` that is not a directory fails, naming the path',
      Gherkin.Do.pipe(
        Given('a package whose `src` is a file')('pkg', () => Effect.succeed(SOURCE_IS_A_FILE)),
        When('the command runs over it')('run', (s) => runStopEnrollmentCli([s.pkg])),
        Then('it exits non-zero and names the path')((s, expect) =>
          expect({ exitCode: s.run.exitCode, names: s.run.output[0]?.includes('src is not a directory') }).toEqual({
            exitCode: 1,
            names: true,
          })
        ),
      ),
    )

    scenario(
      'A package with neither tsconfig fails, naming both paths searched',
      Gherkin.Do.pipe(
        Given('a package that declares no tsconfig')('pkg', () => Effect.succeed(NO_TSCONFIG)),
        When('the command runs over it')('run', (s) => runStopEnrollmentCli([s.pkg])),
        Then('it exits non-zero and names both candidate paths')((s, expect) =>
          expect({
            exitCode: s.run.exitCode,
            searchedTest: s.run.output[0]?.includes('tsconfig.test.json'),
            searchedPlain: s.run.output[0]?.includes('tsconfig.json'),
          }).toEqual({ exitCode: 1, searchedTest: true, searchedPlain: true })
        ),
      ),
    )

    scenario(
      'A command given an option it does not know is refused with its usage',
      Gherkin.Do.pipe(
        Given('an argument the command does not accept')('args', () => Effect.succeed(['--unknown'])),
        When('the command runs')('run', (s) => runStopEnrollmentCli(s.args)),
        Then('it exits non-zero and prints the usage')((s, expect) => {
          const output = s.run.output.join('\n')
          return expect({ exitCode: s.run.exitCode, usage: output.includes('usage: stop-enrollment') }).toEqual({
            exitCode: 1,
            usage: true,
          })
        }),
      ),
    )
  })
