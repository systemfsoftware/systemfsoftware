import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'
import {
  createPackage,
  createPackageFromTarballData,
  packPackage,
  packTree,
  toDirectoryJSON,
} from './__fixtures__/npm-package.js'

const Feature = makeFeature({ it, layer })

Feature('npm-package in-memory file tree and tarball round-trip').body(({ scenario }) => {
  scenario(
    'Should_TolerateZeroPaddedGzip_When_TrailingZerosAppended',
    Effect.sync(() => {
      const tree = {
        'package.json': JSON.stringify({ name: 'pad-test', version: '0.0.1' }),
        'index.js': 'hi',
      }
      const original = createPackage(tree, 'pad-test', '0.0.1')
      const tarball = packPackage(original)
      const padded = new Uint8Array(tarball.length + 1024)
      padded.set(tarball, 0)
      const extractedPadded = createPackageFromTarballData(padded)
      const extracted = createPackageFromTarballData(tarball)
      expect(extractedPadded.packageName).toBe(extracted.packageName)
      expect(extractedPadded.packageVersion).toBe(extracted.packageVersion)
      expect(extractedPadded.listFiles('/').sort()).toEqual(extracted.listFiles('/').sort())
      for (const p of extracted.listFiles('/')) {
        expect(extractedPadded.tryReadBytes(p)).toEqual(extracted.tryReadBytes(p))
      }
    }),
  )

  scenario(
    'Should_FailWithMissingPath_When_TarballHasNoPackageJson',
    Effect.sync(() => {
      const tarball = packTree({ 'index.js': 'hi' }, 'no-pkg')
      expect(() => createPackageFromTarballData(tarball)).toThrow(/package\.json/)
    }),
  )

  scenario(
    'Should_Fail_When_PackageJsonLacksName',
    Effect.sync(() => {
      const tarball = packTree(
        { 'package.json': JSON.stringify({ version: '1.0.0' }), 'index.js': 'hi' },
        'missing-name',
      )
      expect(() => createPackageFromTarballData(tarball)).toThrow(/Invalid package\.json/)
    }),
  )

  scenario(
    'Should_Fail_When_PackageJsonLacksVersion',
    Effect.sync(() => {
      const tarball = packTree(
        { 'package.json': JSON.stringify({ name: 'missing-version' }), 'index.js': 'hi' },
        'missing-version',
      )
      expect(() => createPackageFromTarballData(tarball)).toThrow(/Invalid package\.json/)
    }),
  )

  scenario(
    'Should_RoundTripScopedName_When_PackageNameIsScoped',
    Effect.sync(() => {
      const scoped = '@scope/name'
      const tree = {
        'package.json': JSON.stringify({ name: scoped, version: '2.0.0' }),
        'index.js': 'scoped',
        'lib/util.js': 'util',
      }
      const pkg = createPackage(tree, scoped, '2.0.0')
      expect(pkg.fileExists(`/node_modules/${scoped}/package.json`)).toBe(true)
      expect(pkg.fileExists(`/node_modules/${scoped}/index.js`)).toBe(true)
      const tarball = packPackage(pkg)
      const extracted = createPackageFromTarballData(tarball)
      expect(extracted.packageName).toBe(scoped)
      expect(extracted.packageVersion).toBe('2.0.0')
      expect(extracted.fileExists(`/node_modules/${scoped}/package.json`)).toBe(true)
      expect(extracted.fileExists(`/node_modules/${scoped}/lib/util.js`)).toBe(true)
      const treeTarball = packTree(tree, scoped)
      const fromTree = createPackageFromTarballData(treeTarball)
      expect(fromTree.packageName).toBe(scoped)
      expect(fromTree.fileExists(`/node_modules/${scoped}/index.js`)).toBe(true)
    }),
  )

  scenario(
    'Should_HandleTreePaths_When_CreatingPackageFromAuthoredTree',
    Effect.sync(() => {
      expect(() => createPackage({ 'index.js': 'hi' }, 'no-pkg', '1.0.0')).toThrow(
        /package\.json/,
      )
      const pkg = createPackage(
        {
          'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
          'relative.js': 'rel',
          '/node_modules/demo/absolute.js': 'abs',
        },
        'demo',
        '1.0.0',
      )
      expect(pkg.fileExists('/node_modules/demo/relative.js')).toBe(true)
      expect(pkg.fileExists('/node_modules/demo/absolute.js')).toBe(true)
      expect(pkg.tryReadFile('/node_modules/demo/relative.js')).toBe('rel')
      expect(pkg.tryReadFile('/node_modules/demo/absolute.js')).toBe('abs')
      expect(() =>
        createPackage(
          {
            'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
            '/node_modules/other/index.js': 'bad',
          },
          'demo',
          '1.0.0',
        )
      ).toThrow(/Unexpected absolute fixture path/)
    }),
  )

  scenario(
    'Should_BehaveIdentically_When_DirectoryGivenWithAndWithoutTrailingSeparator',
    Effect.sync(() => {
      const pkg = createPackage(
        {
          'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
          'a/b.js': '1',
          'a/c.js': '2',
          'd.js': '3',
        },
        'demo',
        '1.0.0',
      )
      expect(pkg.listFiles('/node_modules/demo/a')).toEqual(pkg.listFiles('/node_modules/demo/a/'))
      expect(pkg.listFiles('/node_modules/demo')).toEqual(pkg.listFiles('/node_modules/demo/'))
      expect(pkg.directoryExists('/node_modules/demo/a')).toBe(true)
      expect(pkg.directoryExists('/node_modules/demo/a/')).toBe(true)
      expect(pkg.directoryExists('/node_modules/demo')).toBe(true)
      expect(pkg.directoryExists('/node_modules/demo/')).toBe(true)
      expect(pkg.directoryExists('/node_modules/demo/missing')).toBe(false)
      expect(pkg.directoryExists('/node_modules/demo/missing/')).toBe(false)
    }),
  )

  scenario(
    'Should_ReturnRawBytes_When_BinaryBodyAfterTextCache',
    Effect.sync(() => {
      const binary = new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x80, 0x81])
      const pkg = createPackage(
        {
          'package.json': JSON.stringify({ name: 'bin-test', version: '1.0.0' }),
          'text.txt': 'hello',
          'asset.bin': binary,
        },
        'bin-test',
        '1.0.0',
      )
      expect(pkg.tryReadFile('/node_modules/bin-test/text.txt')).toBe('hello')
      const bytes = pkg.tryReadBytes('/node_modules/bin-test/asset.bin')
      expect(bytes instanceof Uint8Array).toBe(true)
      expect(Array.from(bytes as Uint8Array)).toEqual(Array.from(binary))
      const tarball = packPackage(pkg)
      const extracted = createPackageFromTarballData(tarball)
      const extractedBytes = extracted.tryReadBytes('/node_modules/bin-test/asset.bin')
      expect(Array.from(extractedBytes as Uint8Array)).toEqual(Array.from(binary))
    }),
  )

  scenario(
    'Should_OverlayWithOtherWins_When_MergingTwoPackages',
    Effect.sync(() => {
      const base = createPackage(
        {
          'package.json': JSON.stringify({ name: 'base', version: '1.0.0' }),
          '/node_modules/base/shared.txt': 'base',
          '/node_modules/base/only-base.txt': 'base-only',
        },
        'base',
        '1.0.0',
      )
      const other = createPackage(
        {
          'package.json': JSON.stringify({ name: 'other', version: '9.9.9' }),
          '/node_modules/base/shared.txt': 'other-wins',
          '/node_modules/base/only-other.txt': 'other-only',
        },
        'base',
        '9.9.9',
      )
      const merged = base.withOverlay(other)
      expect(merged.tryReadFile('/node_modules/base/shared.txt')).toBe('other-wins')
      expect(merged.tryReadFile('/node_modules/base/only-base.txt')).toBe('base-only')
      expect(merged.tryReadFile('/node_modules/base/only-other.txt')).toBe('other-only')
      expect(merged.packageName).toBe('base')
      expect(merged.packageVersion).toBe('1.0.0')
      expect(base.tryReadFile('/node_modules/base/shared.txt')).toBe('base')
      expect(other.tryReadFile('/node_modules/base/shared.txt')).toBe('other-wins')
    }),
  )

  scenario(
    'Should_ProjectToDirectoryJSON_When_TreeHasStringAndBinaryEntries',
    Effect.sync(() => {
      const files = {
        'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
        'index.js': 'hi',
        'asset.bin': new Uint8Array([1, 2, 3]),
      }
      const pkg = createPackage(files, 'demo', '1.0.0')
      const dirJson = toDirectoryJSON(files, 'demo')
      const pkgPaths = pkg.listFiles('/').sort()
      const jsonKeys = Object.keys(dirJson).sort()
      expect(jsonKeys).toEqual(pkgPaths)
      expect(dirJson['/node_modules/demo/index.js']).toBe('hi')
      const bin = dirJson['/node_modules/demo/asset.bin'] as Uint8Array
      expect(bin instanceof Uint8Array).toBe(true)
      expect(Array.from(bin)).toEqual([1, 2, 3])
      const withNull: Record<string, string | Uint8Array | null> = {
        '/node_modules/demo/a.js': 'a',
        '/node_modules/demo/empty': null,
      }
      expect(withNull['/node_modules/demo/empty']).toBeNull()
    }),
  )
})
