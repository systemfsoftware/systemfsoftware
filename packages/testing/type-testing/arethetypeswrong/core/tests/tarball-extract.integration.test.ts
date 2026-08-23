import {
  createPackage,
  createPackageFromTarballData,
  packPackage,
  packTree,
} from '@systemfsoftware/arethetypeswrong-core'
import { it, layer, makeFeature, StepError } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Tarball extract proof — pack then extract round-trips (AE5/AE8)').body(({ scenario }) => {
  scenario(
    'Should_ExtractSamePathsAndBodies_When_PackedConstructorTreeIsExtracted',
    Effect.sync(() => {
      const original = createPackage(
        {
          'package.json': JSON.stringify({
            name: 'extract-pack-test',
            version: '1.0.0',
            main: './dist/index.js',
            types: './dist/index.d.ts',
          }),
          'dist/index.js': 'module.exports = { a: 1 };\n',
          'dist/index.d.ts': 'export declare const a: number;\n',
          'README.md': '# hello\n',
        },
        'extract-pack-test',
        '1.0.0',
      )

      const tarball = packPackage(original)
      const extracted = createPackageFromTarballData(tarball)

      expect(extracted.packageName).toBe(original.packageName)
      expect(extracted.packageVersion).toBe(original.packageVersion)

      const originalPaths = original.listFiles('/').sort()
      const extractedPaths = extracted.listFiles('/').sort()
      expect(extractedPaths).toEqual(originalPaths)

      for (const path of originalPaths) {
        expect(extracted.tryReadFile(path)).toBe(original.tryReadFile(path))
      }

      const treeTarball = packTree(
        {
          'package.json': JSON.stringify({
            name: 'extract-pack-test',
            version: '1.0.0',
            main: './dist/index.js',
            types: './dist/index.d.ts',
          }),
          'dist/index.js': 'module.exports = { a: 1 };\n',
          'dist/index.d.ts': 'export declare const a: number;\n',
        },
        'extract-pack-test',
      )
      const fromTree = createPackageFromTarballData(treeTarball)
      expect(fromTree.packageName).toBe('extract-pack-test')
      expect(fromTree.listFiles('/').sort()).toContain('/node_modules/extract-pack-test/package.json')
    }).pipe(Effect.mapError((cause) => new StepError({ keyword: 'scenario', text: 'AE5 pack/extract failed', cause }))),
  )

  scenario(
    'Should_PreserveBinaryBytes_When_PackedAndExtracted',
    Effect.sync(() => {
      const binary = new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x80, 0x81])
      const original = createPackage(
        {
          'package.json': JSON.stringify({ name: 'bin-test', version: '1.0.0' }),
          'asset.bin': binary,
        },
        'bin-test',
        '1.0.0',
      )

      const extracted = createPackageFromTarballData(packPackage(original))
      const bytes = extracted.tryReadBytes('/node_modules/bin-test/asset.bin')
      expect(Array.from(bytes as Uint8Array)).toEqual(Array.from(binary))
    }).pipe(
      Effect.mapError((cause) =>
        new StepError({ keyword: 'scenario', text: 'binary bytes did not round-trip', cause })
      ),
    ),
  )

  scenario(
    'Should_FailExtract_When_GzipBytesAreZeroPaddedHeader',
    Effect.sync(() => {
      const zeroPadded = new Uint8Array(32)
      let threw = false
      try {
        createPackageFromTarballData(zeroPadded)
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
    }),
  )

  scenario(
    'Should_FailExtract_When_GzipBytesAreTruncatedHeader',
    Effect.sync(() => {
      const truncated = Uint8Array.from([0x1f, 0x8b, 0x08, 0x00])
      let threw = false
      try {
        createPackageFromTarballData(truncated)
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
    }),
  )

  scenario(
    'Should_FailExtract_When_GzipBytesAreNotGzipAtAll',
    Effect.sync(() => {
      const notGzip = new TextEncoder().encode('not a gzip file at all')
      let threw = false
      try {
        createPackageFromTarballData(notGzip)
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
    }),
  )
})
