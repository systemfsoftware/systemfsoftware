import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Schema } from 'effect'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

import { checkPackage, createPackageFromTarballData } from '../src/index.js'
import { SnapshotRecordSchema } from './__fixtures__/Snapshot.schema.js'
import {
  fileExists,
  listDirectory,
  parseJson,
  readBytes,
  readEnv,
  readTextFile,
  writeTextFile,
} from './__fixtures__/fixture-io.mjs'

const Feature = makeFeature({ it, layer })

const fixturesDir = new URL('./__fixtures__/fixtures/', import.meta.url)
const snapshotsDir = new URL('./__fixtures__/snapshots/', import.meta.url)

/** Fixtures whose analysis is exercised together with their recorded @types companion. */
const typesPackages: Readonly<Partial<Record<string, string>>> = {
  'big.js@6.2.1.tgz': '@types__big.js@6.2.0.tgz',
  'react@18.2.0.tgz': '@types__react@18.2.21.tgz',
  'semver@7.6.3.tgz': '@types__semver@7.5.8.tgz',
}

/** A fixture whose analysis is expected to fail; it has no recorded snapshot. */
const rejectedFixture = 'Babel@0.0.1.tgz'

const updateSnapshots = readEnv('UPDATE_SNAPSHOTS') ?? readEnv('U') ?? ''
const testFilter = (readEnv('TEST_FILTER') ?? readEnv('T') ?? '').toLowerCase()

const urlOf = (dir: URL, name: string): URL => new URL(`./${name}`, dir)

const fixtures = listDirectory(fixturesDir).filter(
  (fixture) =>
    fixture !== '.DS_Store' &&
    !fixture.startsWith('@types__') &&
    fixture !== rejectedFixture &&
    (testFilter === '' || fixture.toLowerCase().includes(testFilter)),
)

Feature('The analysis of a published package reproduces its recorded outcome', { timeout: 60_000 }).body(({ scenario }) => {
  for (const fixture of fixtures) {
    const typesFixture = typesPackages[fixture]
    scenario(
      `the analysis of ${fixture} reproduces its recorded snapshot`,
      Gherkin.Do.pipe(
        Given('the fixture tarball, and its @types companion when recorded')('loaded', () =>
          Effect.sync(() => ({
            tarball: readBytes(urlOf(fixturesDir, fixture)),
            typesTarball: typesFixture === undefined ? undefined : readBytes(urlOf(fixturesDir, typesFixture)),
          })),
        ),
        When('the package is analysed with the recorded types companion')('analysis', ({ loaded }) =>
          Effect.tryPromise(() => {
            const pkg = createPackageFromTarballData(loaded.tarball)
            const merged =
              loaded.typesTarball === undefined
                ? pkg
                : pkg.mergedWithTypes(createPackageFromTarballData(loaded.typesTarball))
            return checkPackage(merged)
          }),
        ),
        Then('the recorded snapshot still matches the canonical analysis')(({ analysis }) =>
          Effect.sync(() => {
            const snapshotURL = urlOf(snapshotsDir, `${fixture}.json`)
            if (updateSnapshots !== '' || !fileExists(snapshotURL)) {
              writeTextFile(snapshotURL, JSON.stringify(analysis, null, 2) + '\n')
              return
            }
            const recorded = Schema.decodeUnknownSync(SnapshotRecordSchema)(parseJson(readTextFile(snapshotURL)))
            expect(recorded).toEqual(analysis)
          }),
        ),
      ),
    )
  }

  scenario(
    `the malformed ${rejectedFixture} fixture is rejected by the analysis`,
    Gherkin.Do.pipe(
      Given(`the ${rejectedFixture} fixture`)('tarball', () =>
        Effect.sync(() => readBytes(urlOf(fixturesDir, rejectedFixture))),
      ),
      When('the fixture is analysed')('outcome', ({ tarball }) =>
        Effect.result(Effect.tryPromise(() => checkPackage(createPackageFromTarballData(tarball)))),
      ),
      Then('the analysis fails')(({ outcome }) =>
        Effect.sync(() => {
          expect(outcome).toEqual(Result.fail(expect.anything()))
        }),
      ),
    ),
  )
})