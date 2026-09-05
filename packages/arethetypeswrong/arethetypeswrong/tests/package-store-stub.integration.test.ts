import { PackageStore, PackageStoreStub } from '@systemfsoftware/arethetypeswrong'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('The PackageStore stub serves its recorded tarball through the published surface').body(({ scenario }) => {
  scenario(
    'the package store stub serves its recorded tarball through the layer contract',
    Gherkin.Do.pipe(
      Given('a stub layer with a recorded package ref and tarball')(
        'layer',
        () =>
          Effect.sync(() =>
            PackageStoreStub(
              {
                packageName: 'stubbed-pkg',
                packageVersion: '1.0.0',
                tarballUrl: 'https://registry.example/stubbed.tgz',
              },
              new Uint8Array([7, 7, 7]),
            )
          ),
      ),
      When('resolveTarballRef is called through the PackageStore service')('ref', ({ layer }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* PackageStore
            return yield* service.resolveTarballRef([{ name: 'stubbed-pkg', versionKind: 'tag', version: 'latest' }])
          }),
          layer,
        )),
      Then('the stub returns the recorded ref')(({ ref }) =>
        Effect.sync(() => {
          expect(ref.packageName).toBe('stubbed-pkg')
          expect(ref.packageVersion).toBe('1.0.0')
          expect(ref.tarballUrl).toBe('https://registry.example/stubbed.tgz')
        })
      ),
    ),
  )

  scenario(
    'the injected tarball ref is returned when the PackageStore stub is bound',
    Gherkin.Do.pipe(
      Given('a PackageStore stub with a recorded ref and tarball')(
        'layer',
        () =>
          Effect.sync(() =>
            PackageStoreStub(
              {
                packageName: 'renamed-pkg',
                packageVersion: '2.0.0',
                tarballUrl: 'https://registry.example/renamed.tgz',
              },
              new Uint8Array([9, 9, 9]),
            )
          ),
      ),
      When('resolveTarballRef is called through the PackageStore service')('ref', ({ layer }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* PackageStore
            return yield* service.resolveTarballRef([{ name: 'renamed-pkg', versionKind: 'tag', version: 'latest' }])
          }),
          layer,
        )),
      Then('the stub returns the injected ref')(({ ref }) =>
        Effect.sync(() => {
          expect(ref.packageName).toBe('renamed-pkg')
          expect(ref.packageVersion).toBe('2.0.0')
          expect(ref.tarballUrl).toBe('https://registry.example/renamed.tgz')
        })
      ),
    ),
  )
})
