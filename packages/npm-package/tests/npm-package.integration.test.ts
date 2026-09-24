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
        Then('the extracted package metadata and all byte contents match identically')((s, expect) => {
          const files = ['/node_modules/pad-test/index.js', '/node_modules/pad-test/package.json']
          const asPackage = (pkg: Package) => ({
            packageName: pkg.packageName,
            packageVersion: pkg.packageVersion,
            files: pkg.listFiles('/').sort(),
            contents: files.map((path) => pkg.tryReadFile(path)),
          })
          const expected = {
            packageName: 'pad-test',
            packageVersion: '0.0.1',
            files,
            contents: ['hi', jsonString({ name: 'pad-test', version: '0.0.1' })],
          }
          return expect({
            padded: asPackage(s.extracted.extractedPadded),
            unpadded: asPackage(s.extracted.extracted),
          }).toEqual({ padded: expected, unpadded: expected })
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
              return { message: undefined }
            } catch (err) {
              return { message: err instanceof Error ? err.message : undefined }
            }
          })),
        Then('the operation fails complaining of a missing package.json')((s, expect) =>
          expect(s.attempt).toMatchObject({ message: 'Package tarball does not contain package/package.json' })
        ),
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
              return { message: undefined }
            } catch (err) {
              return { message: err instanceof Error ? err.message : undefined }
            }
          })),
        Then('the operation fails validation with an invalid package.json error')((s, expect) =>
          expect(s.attempt).toMatchObject({
            message: 'Invalid package.json in package/package.json: {"version":"1.0.0"}',
          })
        ),
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
              return { message: undefined }
            } catch (err) {
              return { message: err instanceof Error ? err.message : undefined }
            }
          })),
        Then('the operation fails validation with an invalid package.json error')((s, expect) =>
          expect(s.attempt).toMatchObject({
            message: 'Invalid package.json in package/package.json: {"name":"missing-version"}',
          })
        ),
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
        Then('the extracted package preserves scope in name, version, and file tree')((s, expect) =>
          expect({
            packageName: s.extracted.packageName,
            packageVersion: s.extracted.packageVersion,
            manifest: s.extracted.fileExists(`/node_modules/${s.ctx.scoped}/package.json`),
            util: s.extracted.fileExists(`/node_modules/${s.ctx.scoped}/lib/util.js`),
          }).toEqual({
            packageName: s.ctx.scoped,
            packageVersion: '2.0.0',
            manifest: true,
            util: true,
          })
        ),
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
        Then('both path forms are resolved and read cleanly under node_modules')((s, expect) =>
          expect({
            hasRelative: s.pkg.fileExists('/node_modules/demo/relative.js'),
            hasAbsolute: s.pkg.fileExists('/node_modules/demo/absolute.js'),
            relative: s.pkg.tryReadFile('/node_modules/demo/relative.js'),
            absolute: s.pkg.tryReadFile('/node_modules/demo/absolute.js'),
          }).toEqual({ hasRelative: true, hasAbsolute: true, relative: 'rel', absolute: 'abs' })
        ),
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
        Then('the returned file sets and directory existence checks are identical')((s, expect) =>
          expect({
            list: s.results.listA.sort(),
            listSlash: s.results.listASlash.sort(),
            existsRoot: s.results.existsRoot,
            existsRootSlash: s.results.existsRootSlash,
          }).toEqual({
            list: ['/node_modules/demo/a/b.js', '/node_modules/demo/a/c.js'],
            listSlash: ['/node_modules/demo/a/b.js', '/node_modules/demo/a/c.js'],
            existsRoot: true,
            existsRootSlash: true,
          })
        ),
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
        Then('the raw bytes are preserved without modification')((s, expect) => expect(s.bytes).toEqual(s.ctx.binary)),
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
        Then('the overlay values win for overlapping files while unique files are retained')((s, expect) =>
          expect({
            shared: s.merged.tryReadFile('/node_modules/base/shared.txt'),
            onlyBase: s.merged.tryReadFile('/node_modules/base/only-base.txt'),
            onlyOther: s.merged.tryReadFile('/node_modules/base/only-other.txt'),
            packageName: s.merged.packageName,
            packageVersion: s.merged.packageVersion,
          }).toEqual({
            shared: 'other-wins',
            onlyBase: 'base-only',
            onlyOther: 'other-only',
            packageName: 'base',
            packageVersion: '1.0.0',
          })
        ),
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
        Then('the JSON map retains the paths, string contents, and raw binary buffers')((s, expect) => {
          const bin = uint8Of(s.dirJson['/node_modules/demo/asset.bin'])
          return expect({
            index: s.dirJson['/node_modules/demo/index.js'],
            bytes: Array.from(bin),
          }).toEqual({ index: 'hi', bytes: [1, 2, 3] })
        }),
      ),
    )
  })
