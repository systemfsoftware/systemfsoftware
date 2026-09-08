import { PackageStore, PackageStoreStub } from '@systemfsoftware/arethetypeswrong'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Serving a recorded package archive').body(({ scenario }) => {
  scenario(
    'The recorded archive is returned when a different registry address is requested',
    Gherkin.Do.pipe(
      Given('a store holding a recorded archive')(
        'recorded',
        () => Effect.succeed(new Uint8Array([7, 7, 7])),
      ),
      When('the archive is fetched at a different registry address')(
        'bytes',
        (s) =>
          Effect.gen(function*() {
            const store = yield* PackageStore
            return yield* store.fetchTarball({
              kind: 'registry',
              url: 'https://example.invalid/unused.tgz',
            })
          }).pipe(
            Effect.provide(
              PackageStoreStub(
                {
                  packageName: 'recorded-pkg',
                  packageVersion: '1.0.0',
                  tarball: { kind: 'registry', url: 'https://registry.example/recorded.tgz' },
                },
                s.recorded,
              ),
            ),
          ),
      ),
      Then('the recorded bytes are returned')((s) => {
        expect(s.bytes).toEqual(s.recorded)
      }),
    ),
  )
})
