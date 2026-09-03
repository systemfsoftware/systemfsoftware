import { PackageStore, PackageStoreStub } from '@systemfsoftware/arethetypeswrong'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { createPackage, packPackage } from '@systemfsoftware/npm-package'
import { Effect } from 'effect'
import { expect } from 'vitest'
// oxlint-disable-next-line @systemfsoftware/effect-dmmf/tests-import-public-api -- package-private service, reached from source on purpose
import { LexerAdapter, LexerAdapterStub } from '../src/LexerAdapter.js'
// oxlint-disable-next-line @systemfsoftware/effect-dmmf/tests-import-public-api -- package-private service, reached from source on purpose
import { ResolverAdapter, ResolverAdapterStub } from '../src/ResolverAdapter.js'
// oxlint-disable-next-line @systemfsoftware/effect-dmmf/tests-import-public-api -- package-private service, reached from source on purpose
import { TarballAdapter, TarballAdapterLive, TarballAdapterStub } from '../src/TarballAdapter.js'
// oxlint-disable-next-line @systemfsoftware/effect-dmmf/tests-import-public-api -- package-private service, reached from source on purpose
import { TypescriptAdapter, TypescriptAdapterStub } from '../src/TypescriptAdapter.js'

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
    'the package store stub serves its recorded tarball through the layer contract',
    Gherkin.Do.pipe(
      Given('a stub layer with a recorded package ref and tarball')(
        'layer',
        () =>
          Effect.sync(() =>
            PackageStoreStub(
              { packageName: 'x', packageVersion: '1.0.0', tarballUrl: 'https://registry.example/x.tgz' },
              new Uint8Array([1]),
            )
          ),
      ),
      When('the layer is queried through the PackageStore service')('stored', ({ layer }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* PackageStore
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

  scenario(
    'Should_returnInjectedTarball_When_PackageStoreStubIsBound',
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

  scenario(
    'Should_returnSameExtractedTarball_When_TarballIsReadThroughInternalService',
    Gherkin.Do.pipe(
      Given('a packed tarball from an authored package tree')(
        'tarball',
        () =>
          Effect.sync(() => {
            const pkg = createPackage(
              {
                'package.json': JSON.stringify({ name: 'delegated-pkg', version: '1.2.3' }),
                'index.js': 'module.exports = 42',
                'lib/util.js': 'export const x = 1',
              },
              'delegated-pkg',
              '1.2.3',
            )
            return packPackage(pkg)
          }),
      ),
      When('the tarball is extracted through the internal TarballAdapter')('extracted', ({ tarball }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* TarballAdapter
            return yield* service.extract(tarball)
          }),
          TarballAdapterLive,
        )),
      Then('the extracted tarball has the same name version and re-rooted files excluding package.json')(
        ({ extracted }) =>
          Effect.sync(() => {
            expect(extracted.packageName).toBe('delegated-pkg')
            expect(extracted.packageVersion).toBe('1.2.3')
            const paths = extracted.files.map((f) => f.path).sort()
            expect(paths).toEqual(['/node_modules/delegated-pkg/index.js', '/node_modules/delegated-pkg/lib/util.js'])
            const indexFile = extracted.files.find((f) => f.path === '/node_modules/delegated-pkg/index.js')
            expect(new TextDecoder().decode(indexFile?.content)).toBe('module.exports = 42')
            const utilFile = extracted.files.find((f) => f.path === '/node_modules/delegated-pkg/lib/util.js')
            expect(new TextDecoder().decode(utilFile?.content)).toBe('export const x = 1')
            expect(paths).not.toContain('/node_modules/delegated-pkg/package.json')
          }),
      ),
    ),
  )

  scenario(
    'Should_preserveBinaryContent_When_TarballContainsBinaryFile',
    Gherkin.Do.pipe(
      Given('a packed tarball containing a binary file')(
        'tarball',
        () =>
          Effect.sync(() => {
            const binary = new Uint8Array([0, 255, 128, 64])
            const pkg = createPackage(
              {
                'package.json': JSON.stringify({ name: 'binary-pkg', version: '0.0.1' }),
                'data.bin': binary,
              },
              'binary-pkg',
              '0.0.1',
            )
            return packPackage(pkg)
          }),
      ),
      When('the tarball is extracted through the internal TarballAdapter')('extracted', ({ tarball }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* TarballAdapter
            return yield* service.extract(tarball)
          }),
          TarballAdapterLive,
        )),
      Then('the binary file body is preserved byte-for-byte')(({ extracted }) =>
        Effect.sync(() => {
          const file = extracted.files.find((f) => f.path === '/node_modules/binary-pkg/data.bin')
          expect(file).toBeDefined()
          expect(file?.content).toEqual(new Uint8Array([0, 255, 128, 64]))
        })
      ),
    ),
  )

  scenario(
    'Should_bindLexerAdapterInternally_When_ServiceIsPrivate',
    Gherkin.Do.pipe(
      Given('the lexer stub layer')('layer', () => Effect.sync(() => LexerAdapterStub)),
      When('the lexer service is queried internally')('exports', ({ layer }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* LexerAdapter
            const result = yield* service.parseCjsExports('exports.foo = 1')
            return result
          }),
          layer,
        )),
      Then('the internal binding still works')(({ exports }) =>
        Effect.sync(() => {
          expect(exports).toEqual([])
        })
      ),
    ),
  )

  scenario(
    'Should_bindResolverAdapterInternally_When_ServiceIsPrivate',
    Gherkin.Do.pipe(
      Given('the resolver stub layer')('layer', () => Effect.sync(() => ResolverAdapterStub)),
      When('the resolver service is queried internally')('resolution', ({ layer }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* ResolverAdapter
            return yield* service.resolve('some-pkg', './entry', 'node10')
          }),
          layer,
        )),
      Then('the internal resolver binding still works')(({ resolution }) =>
        Effect.sync(() => {
          expect(resolution.fileName).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'Should_bindTypescriptAdapterInternally_When_ServiceIsPrivate',
    Gherkin.Do.pipe(
      Given('the typescript stub layer')('layer', () => Effect.sync(() => TypescriptAdapterStub)),
      When('the typescript service is queried internally')('hosts', ({ layer }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* TypescriptAdapter
            return yield* service.createHosts()
          }),
          layer,
        )),
      Then('the internal typescript binding still works')(({ hosts }) =>
        Effect.sync(() => {
          expect(hosts.size).toBe(0)
        })
      ),
    ),
  )

  scenario(
    'Should_bindTarballAdapterInternally_When_ServiceIsPrivate',
    Gherkin.Do.pipe(
      Given('the tarball stub layer')(
        'layer',
        () =>
          Effect.sync(() => TarballAdapterStub([{ path: '/node_modules/x/file.txt', content: new Uint8Array([5]) }])),
      ),
      When('the tarball service is queried internally')('extracted', ({ layer }) =>
        Effect.provide(
          Effect.gen(function*() {
            const service = yield* TarballAdapter
            return yield* service.extract(new Uint8Array())
          }),
          layer,
        )),
      Then('the internal tarball binding still works')(({ extracted }) =>
        Effect.sync(() => {
          expect(extracted.files[0]?.path).toBe('/node_modules/x/file.txt')
        })
      ),
    ),
  )
})
