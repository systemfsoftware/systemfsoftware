/* oxlint-disable @systemfsoftware/effect-dmmf/tests-import-public-api -- the range-selection predicate is package-private; the test binds it from source to pin the store's durable classification oracle */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { selectRangeTarball } from '../src/PackageStoreAdapter.js'

const Feature = makeFeature({ it, layer })

const versions = {
  '1.2.0': { dist: { tarball: 'https://registry.example/foo/-/foo-1.2.0.tgz' } },
  '1.2.1': { deprecated: 'no longer supported', dist: { tarball: 'https://registry.example/foo/-/foo-1.2.1.tgz' } },
}

const rangeSpec = (version: string) => ({ versionKind: 'range' as const, name: 'foo', version })

Feature('The package store range selection picks the tarball a spec resolves to').body(({ scenario }) => {
  scenario(
    'a deprecated version is skipped unless deprecated versions are allowed',
    Gherkin.Do.pipe(
      Given('the two-version packument map')('versions', () => Effect.sync(() => versions)),
      When('the range ^1.2.0 is resolved with default options')(
        'ref',
        ({ versions: vs }) => Effect.sync(() => selectRangeTarball(vs, rangeSpec('^1.2.0'), {})),
      ),
      Then('the non-deprecated 1.2.0 tarball is selected')(({ ref }) =>
        Effect.sync(() => {
          expect(ref?.packageVersion).toBe('1.2.0')
          expect(ref?.tarballUrl).toBe('https://registry.example/foo/-/foo-1.2.0.tgz')
        })
      ),
    ),
  )

  scenario(
    'allowing deprecated versions selects the highest deprecated candidate',
    Gherkin.Do.pipe(
      Given('the two-version packument map')('versions', () => Effect.sync(() => versions)),
      When('the range ^1.2.0 is resolved with allowDeprecated')(
        'ref',
        ({ versions: vs }) => Effect.sync(() => selectRangeTarball(vs, rangeSpec('^1.2.0'), { allowDeprecated: true })),
      ),
      Then('the deprecated 1.2.1 tarball is selected')(({ ref }) =>
        Effect.sync(() => {
          expect(ref?.packageVersion).toBe('1.2.1')
        })
      ),
    ),
  )

  scenario(
    'a range nothing satisfies selects nothing',
    Gherkin.Do.pipe(
      Given('the two-version packument map')('versions', () => Effect.sync(() => versions)),
      When('the range ^3.0.0 is resolved')(
        'ref',
        ({ versions: vs }) => Effect.sync(() => selectRangeTarball(vs, rangeSpec('^3.0.0'), {})),
      ),
      Then('no tarball ref is returned')(({ ref }) =>
        Effect.sync(() => {
          expect(ref).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'edge range syntax selects through the same predicate',
    Gherkin.Do.pipe(
      Given('the two-version packument map')('versions', () => Effect.sync(() => versions)),
      When('x-range, partial, and prerelease-bearing ranges are resolved')(
        'refs',
        ({ versions: vs }) =>
          Effect.sync(() => [
            selectRangeTarball(vs, rangeSpec('1.x'), {}),
            selectRangeTarball(vs, rangeSpec('1.2'), {}),
            selectRangeTarball(vs, rangeSpec('^1.2.3-rc.1'), {}),
          ]),
      ),
      Then('x-ranges and partials select 1.2.0 and the prerelease range selects nothing')(({ refs }) =>
        Effect.sync(() => {
          const [xRange, partial, prerelease] = refs
          expect(xRange?.packageVersion).toBe('1.2.0')
          expect(partial?.packageVersion).toBe('1.2.0')
          expect(prerelease).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'a range that does not parse selects nothing',
    Gherkin.Do.pipe(
      Given('the two-version packument map')('versions', () => Effect.sync(() => versions)),
      When('an unparseable range is resolved')(
        'ref',
        ({ versions: vs }) => Effect.sync(() => selectRangeTarball(vs, rangeSpec('not-a-range'), {})),
      ),
      Then('no tarball ref is returned')(({ ref }) =>
        Effect.sync(() => {
          expect(ref).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'an invalid candidate version string in the packument is skipped, not fatal',
    Gherkin.Do.pipe(
      Given('a packument containing a malformed version key')('versions', () =>
        Effect.sync(() => ({
          ...versions,
          'not-a-version': { dist: { tarball: 'https://registry.example/foo/-/foo-bad.tgz' } },
        }))),
      When('the range ^1.2.0 is resolved over it')(
        'ref',
        ({ versions: vs }) => Effect.sync(() => selectRangeTarball(vs, rangeSpec('^1.2.0'), {})),
      ),
      Then('the malformed candidate is ignored and 1.2.0 is selected')(({ ref }) =>
        Effect.sync(() => {
          expect(ref?.packageVersion).toBe('1.2.0')
        })
      ),
    ),
  )
})
