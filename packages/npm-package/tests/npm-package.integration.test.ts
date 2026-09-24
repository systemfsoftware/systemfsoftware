import { expect } from '@effect/vitest'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  createPackage,
  createPackageFromTarballData,
  Package,
  packPackage,
  packTree,
  toDirectoryJSON,
} from '@systemfsoftware/npm-package'
import { Effect, Layer } from 'effect'

const Feature = makeFeature({ it })
const jsonString = <V = unknown>(value: V): string => JSON.stringify(value)

const uint8Of = (value: string | Uint8Array | null | undefined): Uint8Array => {
  if (value instanceof Uint8Array) return value
  return new Uint8Array()
}

Feature('npm-package in-memory file tree and tarball round-trip')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Zero padded gzip tarballs are tolerated and round-trip successfully',
      Gherkin.Do.pipe(
        Given('an uncompressed package tree packed into a tarball with extra trailing zeroes')('ctx', () => {
          const tree = {
            'package.json': jsonString({ name: 'pad-test', version: '0.0.1' }),
            'index.js': 'hi',
          }
          const original = createPackage(tree, 'pad-test', '0.0.1')
          const tarball = packPackage(original)
          const padded = new Uint8Array(tarball.length + 1024)
          padded.set(tarball, 0)
          return Effect.succeed({ original, padded, tarball })
        }),
        When('extracting both the padded tarball and the unpadded tarball')('extracted', (s) =>
          Effect.sync(() => {
            const extractedPadded = createPackageFromTarballData(s.ctx.padded)
            const extracted = createPackageFromTarballData(s.ctx.tarball)
            return { extractedPadded, extracted }
          })),
        Then('the extracted package metadata and all byte contents match identically')((s) => {
          const { extractedPadded, extracted } = s.extracted
          expect(extractedPadded.packageName).toBe(extracted.packageName)
          expect(extractedPadded.packageVersion).toBe(extracted.packageVersion)
          expect(extractedPadded.listFiles('/').sort()).toEqual(extracted.listFiles('/').sort())
          for (const p of extracted.listFiles('/')) {
            expect(extractedPadded.tryReadBytes(p)).toEqual(extracted.tryReadBytes(p))
          }
        }),
      ),
    )

    scenario(
      'A tarball missing package.json fails to create a package',
      Gherkin.Do.pipe(
        Given('a tarball archive lacking a package manifest')(
          'tarball',
          () => Effect.sync(() => packTree({ 'index.js': 'hi' }, 'no-pkg')),
        ),
        When('attempting to instantiate a package from the tarball')('attempt', (s) =>
          Effect.sync(() => {
            try {
              createPackageFromTarballData(s.tarball)
              return { threw: false, message: '' }
            } catch (err) {
              return { threw: true, message: err instanceof Error ? err.message : '' }
            }
          })),
        Then('the operation fails complaining of a missing package.json')((s) => {
          expect(s.attempt.threw).toBe(true)
          expect(s.attempt.message).toMatch(/package\.json/)
        }),
      ),
    )

    scenario(
      'A tarball whose package.json lacks a name field fails validation',
      Gherkin.Do.pipe(
        Given('a tarball whose manifest has no name field')('tarball', () =>
          Effect.sync(() =>
            packTree(
              { 'package.json': jsonString({ version: '1.0.0' }), 'index.js': 'hi' },
              'missing-name',
            )
          )),
        When('attempting to instantiate a package from the tarball')('attempt', (s) =>
          Effect.sync(() => {
            try {
              createPackageFromTarballData(s.tarball)
              return { threw: false, message: '' }
            } catch (err) {
              return { threw: true, message: err instanceof Error ? err.message : '' }
            }
          })),
        Then('the operation fails validation with an invalid package.json error')((s) => {
          expect(s.attempt.threw).toBe(true)
          expect(s.attempt.message).toMatch(/Invalid package\.json/)
        }),
      ),
    )

    scenario(
      'A tarball whose package.json lacks a version field fails validation',
      Gherkin.Do.pipe(
        Given('a tarball whose manifest has no version field')('tarball', () =>
          Effect.sync(() =>
            packTree(
              { 'package.json': jsonString({ name: 'missing-version' }), 'index.js': 'hi' },
              'missing-version',
            )
          )),
        When('attempting to instantiate a package from the tarball')('attempt', (s) =>
          Effect.sync(() => {
            try {
              createPackageFromTarballData(s.tarball)
              return { threw: false, message: '' }
            } catch (err) {
              return { threw: true, message: err instanceof Error ? err.message : '' }
            }
          })),
        Then('the operation fails validation with an invalid package.json error')((s) => {
          expect(s.attempt.threw).toBe(true)
          expect(s.attempt.message).toMatch(/Invalid package\.json/)
        }),
      ),
    )

    scenario(
      'A package with a scoped name round-trips correctly through tarball extraction',
      Gherkin.Do.pipe(
        Given('a package structure with an npm scope prefix')('ctx', () => {
          const scoped = '@scope/name'
          const tree = {
            'package.json': jsonString({ name: scoped, version: '2.0.0' }),
            'index.js': 'scoped',
            'lib/util.js': 'util',
          }
          const pkg = createPackage(tree, scoped, '2.0.0')
          return Effect.succeed({ scoped, tree, pkg })
        }),
        When('the scoped package is packed and extracted back')('extracted', (s) =>
          Effect.sync(() => {
            const tarball = packPackage(s.ctx.pkg)
            return createPackageFromTarballData(tarball)
          })),
        Then('the extracted package preserves scope in name, version, and file tree')((s) => {
          expect(s.extracted.packageName).toBe(s.ctx.scoped)
          expect(s.extracted.packageVersion).toBe('2.0.0')
          expect(s.extracted).toSatisfy((pkg: Package) => pkg.fileExists(`/node_modules/${s.ctx.scoped}/package.json`))
          expect(s.extracted).toSatisfy((pkg: Package) => pkg.fileExists(`/node_modules/${s.ctx.scoped}/lib/util.js`))
        }),
      ),
    )

    scenario(
      'An authored tree properly normalizes relative file paths',
      Gherkin.Do.pipe(
        Given('a set of relative and absolute paths for package files')('tree', () =>
          Effect.succeed({
            'package.json': jsonString({ name: 'demo', version: '1.0.0' }),
            'relative.js': 'rel',
            '/node_modules/demo/absolute.js': 'abs',
          })),
        When('the package instance is created')(
          'pkg',
          (s) => Effect.sync(() => createPackage(s.tree, 'demo', '1.0.0')),
        ),
        Then('both path forms are resolved and read cleanly under node_modules')((s) => {
          expect(s.pkg).toSatisfy((pkg: Package) => pkg.fileExists('/node_modules/demo/relative.js'))
          expect(s.pkg).toSatisfy((pkg: Package) => pkg.fileExists('/node_modules/demo/absolute.js'))
          expect(s.pkg.tryReadFile('/node_modules/demo/relative.js')).toBe('rel')
          expect(s.pkg.tryReadFile('/node_modules/demo/absolute.js')).toBe('abs')
        }),
      ),
    )

    scenario(
      'Listing files behaves identically with and without a trailing directory separator',
      Gherkin.Do.pipe(
        Given('a package populated with nested directory structures')('pkg', () =>
          Effect.sync(() =>
            createPackage(
              {
                'package.json': jsonString({ name: 'demo', version: '1.0.0' }),
                'a/b.js': '1',
                'a/c.js': '2',
                'd.js': '3',
              },
              'demo',
              '1.0.0',
            )
          )),
        When('directory listings and queries run across slash-terminated and bare paths')(
          'results',
          (s) =>
            Effect.sync(() => ({
              listA: s.pkg.listFiles('/node_modules/demo/a'),
              listASlash: s.pkg.listFiles('/node_modules/demo/a/'),
              existsRoot: s.pkg.directoryExists('/node_modules/demo'),
              existsRootSlash: s.pkg.directoryExists('/node_modules/demo/'),
            })),
        ),
        Then('the returned file sets and directory existence checks are identical')((s) => {
          expect(s.results.listA).toEqual(s.results.listASlash)
          expect(s.results.existsRoot).toBe(true)
          expect(s.results.existsRootSlash).toBe(true)
        }),
      ),
    )

    scenario(
      'Reading raw bytes preserves binary data even after text caching',
      Gherkin.Do.pipe(
        Given('a package with a binary asset alongside text files')('ctx', () => {
          const binary = new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x80, 0x81])
          const pkg = createPackage(
            {
              'package.json': jsonString({ name: 'bin-test', version: '1.0.0' }),
              'text.txt': 'hello',
              'asset.bin': binary,
            },
            'bin-test',
            '1.0.0',
          )
          return Effect.succeed({ pkg, binary })
        }),
        When('reading the text file first and then reading raw bytes')('bytes', (s) =>
          Effect.sync(() => {
            s.ctx.pkg.tryReadFile('/node_modules/bin-test/text.txt')
            return s.ctx.pkg.tryReadBytes('/node_modules/bin-test/asset.bin')
          })),
        Then('the raw bytes are preserved without modification')((s) => {
          expect(s.bytes).toBeInstanceOf(Uint8Array)
          expect(Array.from(uint8Of(s.bytes))).toEqual(Array.from(s.ctx.binary))
        }),
      ),
    )

    scenario(
      'Merging two packages allows overlay files to win conflicts',
      Gherkin.Do.pipe(
        Given('a base package and an overlay package sharing an overlapping path')('ctx', () => {
          const base = createPackage(
            {
              'package.json': jsonString({ name: 'base', version: '1.0.0' }),
              '/node_modules/base/shared.txt': 'base',
              '/node_modules/base/only-base.txt': 'base-only',
            },
            'base',
            '1.0.0',
          )
          const other = createPackage(
            {
              'package.json': jsonString({ name: 'other', version: '9.9.9' }),
              '/node_modules/base/shared.txt': 'other-wins',
              '/node_modules/base/only-other.txt': 'other-only',
            },
            'base',
            '9.9.9',
          )
          return Effect.succeed({ base, other })
        }),
        When('the base package is combined with the overlay')(
          'merged',
          (s) => Effect.sync(() => s.ctx.base.withOverlay(s.ctx.other)),
        ),
        Then('the overlay values win for overlapping files while unique files are retained')((s) => {
          expect(s.merged.tryReadFile('/node_modules/base/shared.txt')).toBe('other-wins')
          expect(s.merged.tryReadFile('/node_modules/base/only-base.txt')).toBe('base-only')
          expect(s.merged.tryReadFile('/node_modules/base/only-other.txt')).toBe('other-only')
          expect(s.merged.packageName).toBe('base')
          expect(s.merged.packageVersion).toBe('1.0.0')
        }),
      ),
    )

    scenario(
      'A package tree with string and binary entries projects cleanly to DirectoryJSON',
      Gherkin.Do.pipe(
        Given('a file map containing text and binary entries')('files', () =>
          Effect.succeed({
            'package.json': jsonString({ name: 'demo', version: '1.0.0' }),
            'index.js': 'hi',
            'asset.bin': new Uint8Array([1, 2, 3]),
          })),
        When('projecting the entries to DirectoryJSON')(
          'dirJson',
          (s) => Effect.sync(() => toDirectoryJSON(s.files, 'demo')),
        ),
        Then('the JSON map retains the paths, string contents, and raw binary buffers')((s) => {
          expect(s.dirJson['/node_modules/demo/index.js']).toBe('hi')
          const bin = uint8Of(s.dirJson['/node_modules/demo/asset.bin'])
          expect(bin).toBeInstanceOf(Uint8Array)
          expect(Array.from(bin)).toEqual([1, 2, 3])
        }),
      ),
    )
  })
