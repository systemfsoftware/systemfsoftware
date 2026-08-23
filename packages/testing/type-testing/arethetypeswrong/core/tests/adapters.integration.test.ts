import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { LexerAdapter, LexerAdapterStub } from '@systemfsoftware/arethetypeswrong-core'
import { PackageStoreAdapter, PackageStoreAdapterStub } from '@systemfsoftware/arethetypeswrong-core'
import { ResolverAdapter, ResolverAdapterStub } from '@systemfsoftware/arethetypeswrong-core'
import { TarballAdapter, TarballAdapterStub } from '@systemfsoftware/arethetypeswrong-core'
import { TypescriptAdapter, TypescriptAdapterStub } from '@systemfsoftware/arethetypeswrong-core'

const Feature = makeFeature({ it, layer })

Feature('The adapter stubs stand in for their live services').body(({ scenario }) => {
  scenario(
    'the tarball adapter stub serves its recorded fixture through the layer contract',
    Gherkin.Do.pipe(
      Given('a stub layer with one recorded tarball file')(
        'layer',
        () =>
          Effect.sync(() =>
            TarballAdapterStub([{ path: '/node_modules/stub-package/readme.md', content: new Uint8Array([1, 2, 3]) }])
          ),
      ),
      When('the layer is queried through the TarballAdapter service')('extracted', ({ layer }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* TarballAdapter
            return yield* service.extract(new Uint8Array())
          }),
          layer,
        )),
      Then('the stub returns the recorded files unaltered')(({ extracted }) =>
        Effect.sync(() => {
          expect(extracted.packageName).toBe('stub-package')
          expect(extracted.files).toEqual([
            { path: '/node_modules/stub-package/readme.md', content: new Uint8Array([1, 2, 3]) },
          ])
        })
      ),
    ),
  )

  scenario(
    'the package store adapter stub serves its recorded tarball through the layer contract',
    Gherkin.Do.pipe(
      Given('a stub layer with a recorded package ref and tarball')(
        'layer',
        () =>
          Effect.sync(() =>
            PackageStoreAdapterStub(
              { packageName: 'x', packageVersion: '1.0.0', tarballUrl: 'https://registry.example/x.tgz' },
              new Uint8Array([1]),
            )
          ),
      ),
      When('the layer is queried through the PackageStoreAdapter service')('stored', ({ layer }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* PackageStoreAdapter
            return yield* service.fetchTarball('https://registry.example/x.tgz')
          }),
          layer,
        )),
      Then('the stub serves the recorded bytes')(({ stored }) =>
        Effect.sync(() => {
          expect(stored).toEqual(new Uint8Array([1]))
        })
      ),
    ),
  )

  scenario(
    'the resolver adapter stub reports no resolution through the layer contract',
    Gherkin.Do.pipe(
      Given('the resolver stub layer')('layer', () => Effect.sync(() => ResolverAdapterStub)),
      When('the layer is queried through the ResolverAdapter service')('resolution', ({ layer }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* ResolverAdapter
            return yield* service.resolve('x', '.', 'bundler')
          }),
          layer,
        )),
      Then('the stub reports an empty resolution')(({ resolution }) =>
        Effect.sync(() => {
          expect(resolution.fileName).toBeUndefined()
          expect(resolution.trace).toEqual([])
        })
      ),
    ),
  )

  scenario(
    'the typescript adapter stub provides no compiler hosts through the layer contract',
    Gherkin.Do.pipe(
      Given('the typescript adapter stub layer')('layer', () => Effect.sync(() => TypescriptAdapterStub)),
      When('the layer is queried through the TypescriptAdapter service')('hosts', ({ layer }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* TypescriptAdapter
            return yield* service.createHosts()
          }),
          layer,
        )),
      Then('the stub yields an empty host map')(({ hosts }) =>
        Effect.sync(() => {
          expect(hosts.size).toBe(0)
        })
      ),
    ),
  )

  scenario(
    'the lexer adapter stub reports no CJS exports through the layer contract',
    Gherkin.Do.pipe(
      Given('the lexer adapter stub layer')('layer', () => Effect.sync(() => LexerAdapterStub)),
      When('the layer is queried through the LexerAdapter service')('exports', ({ layer }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* LexerAdapter
            return yield* service.parseCjsExports('const answer = 42')
          }),
          layer,
        )),
      Then('the stub reports no exports')(({ exports }) =>
        Effect.sync(() => {
          expect(exports).toEqual([])
        })
      ),
    ),
  )
})
