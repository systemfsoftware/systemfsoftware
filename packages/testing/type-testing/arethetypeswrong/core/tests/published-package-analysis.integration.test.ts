import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

import { checkPackage, createPackageFromTarballData } from '../src/index.js'
import { FixtureIO, fixturesDir, listNames, readTarball, snapshotsDir } from './__fixtures__/FixtureIO.js'

const Feature = makeFeature({ it, layer })

const SNAPSHOTS_DIR = './__fixtures__/snapshots/'

const serialize = (analysis: unknown): string => `${JSON.stringify(analysis, null, 2)}\n`

/** Fixtures whose analysis is exercised together with their recorded @types companion. */
const typesPackages: Readonly<Partial<Record<string, string>>> = {
  'big.js@6.2.1.tgz': '@types__big.js@6.2.0.tgz',
  'react@18.2.0.tgz': '@types__react@18.2.21.tgz',
  'semver@7.6.3.tgz': '@types__semver@7.5.8.tgz',
}

/** A fixture whose analysis is expected to fail; it has no recorded snapshot. */
const rejectedFixture = 'Babel@0.0.1.tgz'

const isRealEntry = (name: string): boolean => name !== '.DS_Store'

const fileNameOf = (fixture: string): string => `${fixture}.json`

const recordingOf = (fixture: string): string => `${SNAPSHOTS_DIR}${fileNameOf(fixture)}`

// Vitest collects a file before running any scenario, so the fixture list - which
// decides how many scenarios exist - is resolved here rather than inside one.
const discovered = await Effect.runPromise(listNames(fixturesDir).pipe(Effect.provide(FixtureIO)))

const fixtures = discovered.filter(
  (fixture) => isRealEntry(fixture) && !fixture.startsWith('@types__') && fixture !== rejectedFixture,
)

Feature('Type-resolution analysis of a published package', { timeout: 60_000 })
  .withLayer(FixtureIO)
  .body(({ scenario }) => {
    for (const fixture of fixtures) {
      const typesFixture = typesPackages[fixture]
      scenario(
        `the analysis of ${fixture} is unchanged from its recorded outcome`,
        Gherkin.Do.pipe(
          Given('the fixture tarball, and its @types companion when recorded')('loaded', () =>
            Effect.gen(function*() {
              const tarball = yield* readTarball(fixturesDir, fixture)
              const typesTarball = typesFixture === undefined
                ? undefined
                : yield* readTarball(fixturesDir, typesFixture)
              return { tarball, typesTarball }
            })),
          When('the package is analysed with the recorded types companion')(
            'analysis',
            ({ loaded }) =>
              Effect.gen(function*() {
                const pkg = createPackageFromTarballData(loaded.tarball)
                const merged = loaded.typesTarball === undefined
                  ? pkg
                  : pkg.mergedWithTypes(createPackageFromTarballData(loaded.typesTarball))
                return yield* checkPackage(merged)
              }),
          ),
          Then('the analysis matches the outcome recorded for this package')(({ analysis }) =>
            Effect.tryPromise(() => expect(serialize(analysis)).toMatchFileSnapshot(recordingOf(fixture)))
          ),
        ),
      )
    }

    scenario(
      'the recorded corpus and the driven fixtures are the same set',
      Gherkin.Do.pipe(
        Given('the recorded outcomes on disk')(
          'recorded',
          () => listNames(snapshotsDir).pipe(Effect.map((names) => names.filter(isRealEntry))),
        ),
        Then('no recorded outcome is orphaned and none is missing')(({ recorded }) =>
          Effect.sync(() => {
            expect([...recorded].sort()).toEqual(fixtures.map(fileNameOf).sort())
          })
        ),
      ),
    )

    scenario(
      `the malformed ${rejectedFixture} fixture is rejected by the analysis`,
      Gherkin.Do.pipe(
        Given(`the ${rejectedFixture} fixture`)(
          'tarball',
          () => readTarball(fixturesDir, rejectedFixture),
        ),
        When('the fixture is analysed')(
          'outcome',
          ({ tarball }) =>
            Effect.result(
              Effect.gen(function*() {
                const pkg = yield* Effect.try(() => createPackageFromTarballData(tarball))
                return yield* checkPackage(pkg)
              }),
            ),
        ),
        Then('the analysis fails')(({ outcome }) =>
          Effect.sync(() => {
            expect(outcome).toEqual(Result.fail(expect.anything()))
          })
        ),
      ),
    )
  })
