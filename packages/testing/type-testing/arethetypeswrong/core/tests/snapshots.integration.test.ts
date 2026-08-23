import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

import { checkPackage, createPackageFromTarballData } from '../src/index.js'
import { listDirectory, readBytes } from './__fixtures__/fixture-io.mjs'

const Feature = makeFeature({ it, layer })

const fixturesDir = new URL('./__fixtures__/fixtures/', import.meta.url)

/** Fixtures whose analysis is exercised together with their recorded @types companion. */
const typesPackages: Readonly<Partial<Record<string, string>>> = {
  'big.js@6.2.1.tgz': '@types__big.js@6.2.0.tgz',
  'react@18.2.0.tgz': '@types__react@18.2.21.tgz',
  'semver@7.6.3.tgz': '@types__semver@7.5.8.tgz',
}

/** A fixture whose analysis is expected to fail; it has no recorded snapshot. */
const rejectedFixture = 'Babel@0.0.1.tgz'

const urlOf = (dir: URL, name: string): URL => new URL(`./${name}`, dir)

const fixtures = listDirectory(fixturesDir).filter(
  (fixture) => fixture !== '.DS_Store' && !fixture.startsWith('@types__') && fixture !== rejectedFixture,
)

Feature('The analysis of a published package reproduces its recorded outcome', { timeout: 60_000 }).body(
  ({ scenario }) => {
    for (const fixture of fixtures) {
      const typesFixture = typesPackages[fixture]
      scenario(
        `the analysis of ${fixture} reproduces its recorded snapshot`,
        Gherkin.Do.pipe(
          Given('the fixture tarball, and its @types companion when recorded')('loaded', () =>
            Effect.sync(() => ({
              tarball: readBytes(urlOf(fixturesDir, fixture)),
              typesTarball: typesFixture === undefined ? undefined : readBytes(urlOf(fixturesDir, typesFixture)),
            }))),
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
          Then('the recorded snapshot still matches the canonical analysis')(({ analysis }) =>
            Effect.promise(() =>
              expect(JSON.stringify(analysis, null, 2) + '\n').toMatchFileSnapshot(
                `./__fixtures__/snapshots/${fixture}.json`,
              )
            )
          ),
        ),
      )
    }

    scenario(
      `the malformed ${rejectedFixture} fixture is rejected by the analysis`,
      Gherkin.Do.pipe(
        Given(`the ${rejectedFixture} fixture`)(
          'tarball',
          () => Effect.sync(() => readBytes(urlOf(fixturesDir, rejectedFixture))),
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
  },
)
